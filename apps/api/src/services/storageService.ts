import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseService';
import { initFirebaseAdmin } from './firebaseService';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PipelineError, ErrorCategory } from '@excerpt/clipping-core';

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
    this.bucket = process.env.B2_BUCKET_NAME || process.env.FIREBASE_STORAGE_BUCKET || "excerpt-d0ab8.appspot.com";
    const accessKeyId = process.env.B2_KEY_ID || process.env.B2_APPLICATION_KEY_ID || "";
    const secretAccessKey = process.env.B2_APPLICATION_KEY || "";

    if (!accessKeyId || accessKeyId === 'your_key_id' || accessKeyId === 'your_b2_key_id' ||
        !secretAccessKey || secretAccessKey === 'your_application_key' || secretAccessKey === 'your_b2_application_key' ||
        accessKeyId === '00578b2722b52f60000000001'
    ) {
      this.s3 = null;
    } else {
      try {
        const region = process.env.B2_REGION || "us-east-005";
        this.s3 = new S3Client({
          endpoint: process.env.B2_ENDPOINT || `https://s3.${region}.backblazeb2.com`,
          credentials: { accessKeyId, secretAccessKey },
          region,
        });
      } catch (err: any) {
        this.s3 = null;
      }
    }
  }

  private getSupabase(): SupabaseClient {
    return supabase();
  }

  private getFirebaseBucket() {
    try {
      const admin = initFirebaseAdmin();
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET || 'excerpt-d0ab8.appspot.com';
      return admin.storage().bucket(bucketName);
    } catch (err: any) {
      return null;
    }
  }

  async uploadFile(filePath: string, key: string): Promise<string> {
    const fileExtension = path.extname(filePath);
    const contentType = this.getContentType(fileExtension);

    // 1. Try Firebase Storage First
    const firebaseBucket = this.getFirebaseBucket();
    if (firebaseBucket) {
      try {
        console.log(`[StorageService]: Attempting Firebase Storage upload for ${key}...`);
        await firebaseBucket.upload(filePath, {
          destination: key,
          metadata: { contentType },
          resumable: false,
        });
        const signedUrl = await this.createSignedUrl(key);
        console.log(`[StorageService]: Firebase Storage Upload Success -> ${key}`);
        return signedUrl;
      } catch (fbErr: any) {
        console.warn(`[StorageService]: Firebase upload fallback: ${fbErr.message}`);
      }
    }

    // 2. Try B2 Upload (if initialized)
    if (this.s3) {
      try {
        console.log(`[StorageService]: Attempting B2 upload for ${key}...`);
        const fileBuffer = fs.readFileSync(filePath);
        const uploadPromise = this.s3.send(new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
          ContentLength: fileBuffer.length,
        }));

        // Generous timeout for high bitrate 1080p clips (120s)
        await Promise.race([
          uploadPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('B2_UPLOAD_TIMEOUT')), 120000))
        ]);

        const region = process.env.B2_REGION || "us-west-004";
        const publicUrl = `https://${this.bucket}.s3.${region}.backblazeb2.com/${key}`;
        console.log(`[StorageService]: B2 Upload Success -> ${publicUrl}`);
        return publicUrl;
      } catch (error: any) {
        console.warn(`[StorageService]: Cloud storage upload fallback: ${error.message}`);
      }
    }

    // 3. Local fallback for development / offline environments
    try {
      const port = process.env.PORT === '3000' ? 8010 : (process.env.PORT || 8010);
      const destPath = path.resolve(process.cwd(), 'temp', key);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      if (path.resolve(filePath) !== destPath) {
        fs.copyFileSync(filePath, destPath);
      }
      const localUrl = `http://localhost:${port}/temp/${key}`;
      console.log(`[StorageService]: Local static fallback -> ${localUrl}`);
      return localUrl;
    } catch (localErr: any) {
      console.error(`[StorageService]: Local fallback failed:`, localErr.message);
    }

    throw new Error(`No cloud storage provider available for ${key}`);
  }

  async createSignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    const ttl = expiresInSeconds || Number(process.env.STORAGE_SIGNED_URL_TTL_SECONDS || 60 * 60);
    
    // 0. Check local disk first (for development or cached clips)
    try {
      const localPath = path.resolve(process.cwd(), 'temp', key);
      if (fs.existsSync(localPath)) {
        const port = process.env.PORT === '3000' ? 8010 : (process.env.PORT || 8010);
        return `http://localhost:${port}/temp/${key}`;
      }
    } catch {}

    // 1. Try Firebase Storage Signed URL ONLY IF object actually exists in Firebase
    const firebaseBucket = this.getFirebaseBucket();
    if (firebaseBucket) {
      try {
        const file = firebaseBucket.file(key);
        const [exists] = await file.exists();
        if (exists) {
          const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + ttl * 1000,
          });
          return signedUrl;
        }
      } catch (fbErr: any) {
        // Fallback to S3/B2
      }
    }

    // 2. Try S3 / B2 Signed URL
    const region = process.env.B2_REGION || "us-east-005";
    if (this.s3) {
      try {
        const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
        const signedUrl = await getSignedUrl(this.s3, command, {
          expiresIn: ttl,
          unhoistableHeaders: new Set(),
        });
        return signedUrl;
      } catch (err: any) {
        return `https://${this.bucket}.s3.${region}.backblazeb2.com/${key}`;
      }
    }

    const port = process.env.PORT === '3000' ? 8010 : (process.env.PORT || 8010);
    return `http://localhost:${port}/temp/${key}`;
  }

  async getFileStream(key: string, range?: string): Promise<{ stream: NodeJS.ReadableStream; contentLength?: number; contentType?: string; contentRange?: string; statusCode?: number } | null> {
    // 1. Local filesystem
    try {
      const localPath = path.resolve(process.cwd(), 'temp', key);
      if (fs.existsSync(localPath)) {
        const stat = fs.statSync(localPath);
        const totalSize = stat.size;
        const contentType = this.getContentType(path.extname(localPath));

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
          const chunkSize = (end - start) + 1;
          const stream = fs.createReadStream(localPath, { start, end });
          return {
            stream,
            contentLength: chunkSize,
            contentType,
            contentRange: `bytes ${start}-${end}/${totalSize}`,
            statusCode: 206,
          };
        }

        return {
          stream: fs.createReadStream(localPath),
          contentLength: totalSize,
          contentType,
          statusCode: 200,
        };
      }
    } catch {}

    // 2. S3 / Backblaze B2 stream
    if (this.s3) {
      try {
        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: range,
        });
        const res = await this.s3.send(command);
        if (res.Body) {
          return {
            stream: res.Body as any,
            contentLength: res.ContentLength,
            contentType: res.ContentType || 'video/mp4',
            contentRange: res.ContentRange,
            statusCode: range ? 206 : 200,
          };
        }
      } catch (err: any) {
        console.warn(`[StorageService]: S3 stream error for ${key}:`, err.message);
      }
    }

    // 3. Firebase stream
    const firebaseBucket = this.getFirebaseBucket();
    if (firebaseBucket) {
      try {
        const file = firebaseBucket.file(key);
        const [exists] = await file.exists();
        if (exists) {
          const [metadata] = await file.getMetadata();
          const stream = file.createReadStream();
          return {
            stream,
            contentLength: Number(metadata.size),
            contentType: metadata.contentType || 'video/mp4',
            statusCode: 200,
          };
        }
      } catch (fbErr: any) {
        console.warn(`[StorageService]: Firebase stream error for ${key}:`, fbErr.message);
      }
    }

    return null;
  }

  async checkObjectExists(key: string): Promise<boolean> {
    // 0. Check local filesystem first
    try {
      const localPath = path.resolve(process.cwd(), 'temp', key);
      if (fs.existsSync(localPath)) return true;
    } catch {}

    const firebaseBucket = this.getFirebaseBucket();
    if (firebaseBucket) {
      try {
        const [exists] = await firebaseBucket.file(key).exists();
        if (exists) return true;
      } catch (err) {
        // Fallback
      }
    }

    if (this.s3) {
      try {
        await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
        return true;
      } catch (err: any) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
      }
    }

    try {
      const dir = path.dirname(key);
      const fileName = path.basename(key);
      const { data } = await this.getSupabase().storage.from("clips").list(dir === '.' ? '' : dir);
      return (data || []).some(item => item.name === fileName);
    } catch {
      return false;
    }
  }

  async listAllObjects(): Promise<string[]> {
    const firebaseBucket = this.getFirebaseBucket();
    if (firebaseBucket) {
      try {
        const [files] = await firebaseBucket.getFiles();
        return files.map(f => f.name);
      } catch (err) {
        // Fallback
      }
    }

    try {
      const { data, error } = await this.getSupabase().storage.from("clips").list("", {
        limit: 1000,
        offset: 0,
        sortBy: { column: "created_at", order: "desc" }
      });
      if (error) return [];
      return (data || []).map(item => item.name);
    } catch {
      return [];
    }
  }

  async deleteFile(key: string): Promise<boolean> {
    try {
      await this.deleteObjects([key]);
      return true;
    } catch {
      return false;
    }
  }

  async deleteObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const firebaseBucket = this.getFirebaseBucket();
    if (firebaseBucket) {
      try {
        await Promise.all(keys.map(k => firebaseBucket.file(k).delete({ ignoreNotFound: true })));
      } catch (err) {
        // Fallback
      }
    }

    try {
      await this.getSupabase().storage.from("clips").remove(keys);
    } catch (err: any) {
      console.warn(`[StorageService]: Supabase object deletion error: ${err.message}`);
    }
  }

  private getContentType(ext: string): string {
    switch (ext.toLowerCase()) {
      case '.mp4': return 'video/mp4';
      case '.webm': return 'video/webm';
      case '.jpg':
      case '.jpeg': return 'image/jpeg';
      case '.png': return 'image/png';
      case '.json': return 'application/json';
      case '.mp3': return 'audio/mpeg';
      case '.wav': return 'audio/wav';
      default: return 'application/octet-stream';
    }
  }
}

export const storageService = StorageService.getInstance();
