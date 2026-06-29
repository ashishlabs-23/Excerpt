import fs from 'fs';
import path from 'path'; // kept for file reads (readFileSync/createReadStream) only
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseService';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Safety load for monorepo context
dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '../../.env') });

export class StorageService {
  private static instance: StorageService | null = null;
  private s3: S3Client | null = null;
  private bucket: string;

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  constructor() {
    this.bucket = process.env.B2_BUCKET_NAME || "excerpt-clips";
    const accessKeyId = process.env.B2_KEY_ID || process.env.B2_APPLICATION_KEY_ID || "";
    const secretAccessKey = process.env.B2_APPLICATION_KEY || "";

    // Check if credentials are placeholders, empty, or invalid (e.g. failing test)
    if (!accessKeyId || accessKeyId === 'your_key_id' || accessKeyId === 'your_b2_key_id' ||
        !secretAccessKey || secretAccessKey === 'your_application_key' || secretAccessKey === 'your_b2_application_key' ||
        accessKeyId === '00578b2722b52f60000000001' // B2 credentials verified to be invalid
    ) {
      console.warn("[StorageService]: Invalid or failing B2 credentials. Will bypass B2 and use Supabase Storage.");
      this.s3 = null;
    } else {
      try {
        const region = process.env.B2_REGION || "us-west-004";
        console.log(`[StorageService]: Connecting to B2 endpoint: ${process.env.B2_ENDPOINT || "default"}...`);
        this.s3 = new S3Client({
          endpoint: process.env.B2_ENDPOINT || `https://s3.${region}.backblazeb2.com`,
          credentials: { accessKeyId, secretAccessKey },
          region,
        });
      } catch (err: any) {
        console.warn(`[StorageService]: Failed to initialize B2 client: ${err.message}`);
        this.s3 = null;
      }
    }
  }

  private getSupabase(): SupabaseClient {
    return supabase();
  }

  async uploadFile(filePath: string, key: string): Promise<string> {
    const fileExtension = path.extname(filePath);
    const contentType = this.getContentType(fileExtension);

    // 1. Try B2 Upload (if initialized)
    if (this.s3) {
      try {
        console.log(`[StorageService]: Attempting B2 upload for ${key}...`);
        const fileStream = fs.createReadStream(filePath);
        await this.s3.send(new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: fileStream,
          ContentType: contentType,
        }));
        
        const region = process.env.B2_REGION || "us-west-004";
        const publicUrl = `https://${this.bucket}.s3.${region}.backblazeb2.com/${key}`;
        console.log(`[StorageService]: B2 Upload Success -> ${publicUrl}`);
        return publicUrl;
      } catch (error: any) {
        console.warn(`[StorageService]: B2 upload failed: ${error.message}. Falling back to Supabase Storage.`);
        // Disable S3 for this lifecycle to avoid repeated timeouts/errors
        this.s3 = null;
      }
    }

    // 2. Try Supabase Storage Upload
      let lastError: any;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[StorageService]: Attempting Supabase upload for ${key} (Attempt ${attempt})...`);
          const fileBuffer = fs.readFileSync(filePath);
          const { error } = await this.getSupabase().storage.from("clips").upload(key, fileBuffer, {
            contentType,
            upsert: true
          });

          if (error) throw error;

          // Verify it exists
          const exists = await this.checkObjectExists(key);
          if (!exists) throw new Error("Upload completed but object verification failed.");

          const signedUrl = await this.createSignedUrl(key);
          console.log(`[StorageService]: Supabase Upload Success -> ${signedUrl}`);
          return signedUrl;
        } catch (error: any) {
          console.warn(`[StorageService]: Supabase upload attempt ${attempt} failed: ${error.message}`);
          lastError = error;
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
      throw new Error(`[StorageService]: All cloud storage options exhausted. Upload failed for key: ${key}. Original error: ${lastError?.message}`);
  }

  async createSignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    const ttl = expiresInSeconds || Number(process.env.STORAGE_SIGNED_URL_TTL_SECONDS || 60 * 60);
    
    if (this.s3) {
      try {
        const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
        const signedUrl = await getSignedUrl(this.s3, command, { expiresIn: ttl });
        return signedUrl;
      } catch (err: any) {
        throw new Error(`[StorageService]: Failed to sign B2 URL for ${key}: ${err.message}`);
      }
    }

    try {
      const { data, error } = await this.getSupabase().storage
        .from("clips")
        .createSignedUrl(key, ttl);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error("No signedUrl returned");

      return data.signedUrl;
    } catch (err: any) {
      throw new Error(`[StorageService]: Failed to sign URL for ${key}: ${err.message}`);
    }
  }

  async checkObjectExists(key: string): Promise<boolean> {
    try {
      if (this.s3) {
        try {
          await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
          return true;
        } catch (err: any) {
          if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
          throw err;
        }
      }
      
      const { data, error } = await this.getSupabase().storage
        .from("clips")
        .list(path.dirname(key), {
          search: path.basename(key)
        });

      if (error) throw error;
      return data && data.length > 0 && data[0].name === path.basename(key);
    } catch (err: any) {
      console.warn(`[StorageService]: Failed to verify object ${key}: ${err.message}`);
      return false;
    }
  }


  /**
   * Delete a single object by its storage key.
   * Returns true if the object was deleted (or didn't exist).
   * Returns false if deletion failed — callers must NOT delete the DB row on false.
   */
  async deleteFile(key: string): Promise<boolean> {
    // 1. Try B2 deletion
    if (this.s3) {
      try {
        const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
        console.log(`[StorageService]: B2 deleted ${key}`);
        return true;
      } catch (err: any) {
        console.warn(`[StorageService]: B2 deleteFile failed for ${key}: ${err.message}`);
        return false;
      }
    }

    // 2. Fallback: Supabase Storage
    try {
      const { error } = await this.getSupabase().storage.from('clips').remove([key]);
      if (error) throw error;
      console.log(`[StorageService]: Supabase deleted ${key}`);
      return true;
    } catch (err: any) {
      console.warn(`[StorageService]: Supabase deleteFile failed for ${key}: ${err.message}`);
      return false;
    }
  }

  async clearAllClips(): Promise<void> {

    console.log("[StorageService]: Initiating cloud purge (no local storage)...");

    if (this.s3) {
      try {
        let isTruncated = true;
        let continuationToken: string | undefined;

        while (isTruncated) {
          const { Contents, IsTruncated, NextContinuationToken } = await this.s3.send(
            new ListObjectsV2Command({ Bucket: this.bucket, ContinuationToken: continuationToken })
          );
          
          if (Contents && Contents.length > 0) {
            await this.s3.send(new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: {
                Objects: Contents.map(c => ({ Key: c.Key }))
              }
            }));
          }
          
          isTruncated = !!IsTruncated;
          continuationToken = NextContinuationToken;
        }
      } catch (err: any) {
         console.warn(`[StorageService]: B2 purge warning: ${err.message}`);
      }
    }

    // Purge Supabase
    try {
      const filesToDelete = await this.listStorageKeys();
      if (filesToDelete.length > 0) {
        await this.getSupabase().storage.from("clips").remove(filesToDelete);
      }
    } catch (err: any) {
      console.warn(`[StorageService]: Supabase purge warning: ${err.message}`);
    }
  }

  private getContentType(extension: string): string {
    switch (extension.toLowerCase()) {
      case '.mp4': return 'video/mp4';
      case '.jpg':
      case '.jpeg': return 'image/jpeg';
      case '.png': return 'image/png';
      default: return 'application/octet-stream';
    }
  }

  private async listStorageKeys(prefix = ''): Promise<string[]> {
    try {
      const { data: list, error } = await this.getSupabase().storage
        .from("clips")
        .list(prefix);

      if (error) throw error;
      if (!list || list.length === 0) return [];

      const keys: string[] = [];
      for (const item of list) {
        const itemKey = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.metadata) {
          keys.push(itemKey);
        } else {
          keys.push(...await this.listStorageKeys(itemKey));
        }
      }
      return keys;
    } catch {
      return [];
    }
  }
}
