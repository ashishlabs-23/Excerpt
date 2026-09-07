import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Readable } from 'stream';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabaseService';
import { initFirebaseAdmin } from './firebaseService';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
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
      const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
      if (!bucketName) return null;
      const admin = initFirebaseAdmin();
      return admin.storage().bucket(bucketName);
    } catch (err: any) {
      return null;
    }
  }

  /**
   * Streams content directly to cloud storage (S3/B2/Supabase) without full memory buffering.
   * Leverages @aws-sdk/lib-storage Upload for multipart streaming chunks.
   */
  async uploadStream(
    stream: Readable,
    key: string,
    contentType: string,
    contentLength?: number
  ): Promise<string> {
    // 1. Primary: S3 / Backblaze B2 multipart stream upload
    if (this.s3) {
      try {
        console.log(`[StorageService]: Streaming direct multipart upload for ${key} (${contentType})...`);
        const parallelUpload = new Upload({
          client: this.s3,
          params: {
            Bucket: this.bucket,
            Key: key,
            Body: stream,
            ContentType: contentType,
            ...(contentLength ? { ContentLength: contentLength } : {}),
          },
          queueSize: 4,
          partSize: 1024 * 1024 * 5, // 5MB chunking
          leavePartsOnError: false,
        });

        await parallelUpload.done();

        const region = process.env.B2_REGION || "us-west-004";
        const publicUrl = `https://${this.bucket}.s3.${region}.backblazeb2.com/${key}`;
        console.log(`[StorageService]: S3/B2 Stream Upload Success -> ${publicUrl}`);
        return publicUrl;
      } catch (uploadErr: any) {
        console.warn(`[StorageService]: S3 stream upload fallback: ${uploadErr.message}`);
      }
    }

    // 2. Fallback: buffer stream for Supabase Storage
    try {
      const supabaseClient = this.getSupabase();
      if (supabaseClient && supabaseClient.storage) {
        console.log(`[StorageService]: Buffering stream for Supabase storage fallback for ${key}...`);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        const storageBucket = this.bucket.includes('.') ? 'clips' : this.bucket;
        const { error: sbErr } = await supabaseClient.storage
          .from(storageBucket)
          .upload(key, buffer, {
            contentType,
            upsert: true,
          });

        if (!sbErr) {
          const { data: publicUrlData } = supabaseClient.storage
            .from(storageBucket)
            .getPublicUrl(key);
          if (publicUrlData?.publicUrl) {
            console.log(`[StorageService]: Supabase Stream Upload Success -> ${publicUrlData.publicUrl}`);
            return publicUrlData.publicUrl;
          }
        }
      }
    } catch (sbErr: any) {
      console.warn(`[StorageService]: Supabase fallback upload failed: ${sbErr.message}`);
    }

    throw new PipelineError({
      category: ErrorCategory.UPLOAD,
      message: `Failed to stream upload ${key}: All cloud storage providers failed.`,
      stage: 'storage_upload_stream',
      component: 'StorageService',
    });
  }

  /**
   * Uploads a file using non-blocking read streams instead of loading entire files into memory.
   */
  async uploadFile(filePath: string, key: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      throw new PipelineError({
        category: ErrorCategory.UPLOAD,
        message: `File to upload does not exist: ${filePath}`,
        stage: 'storage_upload',
        component: 'StorageService',
      });
    }

    const stat = fs.statSync(filePath);
    const fileExtension = path.extname(filePath);
    const contentType = this.getContentType(fileExtension);

    // 1. Try Firebase Storage First (only if explicitly configured)
    const firebaseBucket = this.getFirebaseBucket();
    if (firebaseBucket) {
      try {
        console.log(`[StorageService]: Attempting Firebase Storage upload for ${key}...`);
        const fbPromise = firebaseBucket.upload(filePath, {
          destination: key,
          metadata: { contentType },
          resumable: false,
        });
        await Promise.race([
          fbPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('FIREBASE_UPLOAD_TIMEOUT')), 15000))
        ]);
        const signedUrl = await this.createSignedUrl(key);
        console.log(`[StorageService]: Firebase Storage Upload Success -> ${key}`);
        return signedUrl;
      } catch (fbErr: any) {
        console.warn(`[StorageService]: Firebase upload fallback: ${fbErr.message}`);
      }
    }

    // 2. Stream directly via non-blocking read stream (avoids heap memory spikes)
    const fileStream = fs.createReadStream(filePath);
    return this.uploadStream(fileStream, key, contentType, stat.size);
  }

  /**
   * Generates a presigned S3/B2 PUT URL so clients or background services can upload
   * files directly to cloud storage without routing heavy video binaries through the API server.
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number = 3600
  ): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
    const region = process.env.B2_REGION || "us-west-004";
    const publicUrl = `https://${this.bucket}.s3.${region}.backblazeb2.com/${key}`;

    if (this.s3) {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(this.s3, command, {
        expiresIn: expiresInSeconds,
      });

      return {
        uploadUrl,
        key,
        publicUrl,
      };
    }

    // Supabase fallback if S3 is not configured
    try {
      const supabaseClient = this.getSupabase();
      const storageBucket = this.bucket.includes('.') ? 'clips' : this.bucket;
      const { data, error } = await supabaseClient.storage
        .from(storageBucket)
        .createSignedUploadUrl(key);

      if (!error && data?.signedUrl) {
        return {
          uploadUrl: data.signedUrl,
          key,
          publicUrl: supabaseClient.storage.from(storageBucket).getPublicUrl(key).data.publicUrl,
        };
      }
    } catch (sbErr: any) {
      console.warn(`[StorageService]: Supabase presigned URL generation failed: ${sbErr.message}`);
    }

    // Mock local dev fallback URL
    return {
      uploadUrl: `http://localhost:8010/api/storage/mock-upload/${encodeURIComponent(key)}`,
      key,
      publicUrl,
    };
  }

  async createSignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    const ttl = expiresInSeconds || Number(process.env.STORAGE_SIGNED_URL_TTL_SECONDS || 60 * 60);

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

    // 3. Try Supabase Storage Signed URL
    try {
      const supabaseClient = this.getSupabase();
      if (supabaseClient && supabaseClient.storage) {
        const storageBucket = this.bucket.includes('.') ? 'clips' : this.bucket;
        const { data, error } = await supabaseClient.storage
          .from(storageBucket)
          .createSignedUrl(key, ttl);
        if (!error && data?.signedUrl) {
          return data.signedUrl;
        }
      }
    } catch {}

    const regionFallback = process.env.B2_REGION || "us-east-005";
    return `https://${this.bucket}.s3.${regionFallback}.backblazeb2.com/${key}`;
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

  /**
   * Normalizes a storage path or URL to a clean S3/storage object key.
   */
  public normalizeStorageKey(keyOrUrl: string): string {
    if (!keyOrUrl) return '';
    if (!keyOrUrl.startsWith('http')) {
      return keyOrUrl.replace(/^\/+/, '');
    }
    try {
      const parsed = new URL(keyOrUrl);
      return parsed.pathname.replace(/^\/+/, '');
    } catch {
      return keyOrUrl.replace(/^\/+/, '');
    }
  }

  /**
   * Checks whether an object exists in storage (S3/B2 or local fallback).
   */
  async fileExists(keyOrUrl: string): Promise<boolean> {
    const key = this.normalizeStorageKey(keyOrUrl);
    if (!key) return false;

    if (this.s3) {
      try {
        await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
        return true;
      } catch (err: any) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
          return false;
        }
      }
    }

    const localPath = path.resolve(process.cwd(), 'temp', key);
    if (fs.existsSync(localPath)) return true;

    return false;
  }

  async deleteFile(keyOrUrl: string): Promise<boolean> {
    try {
      await this.deleteObjects([keyOrUrl]);
      return true;
    } catch {
      return false;
    }
  }

  async deleteObjects(keysOrUrls: string[]): Promise<{ deleted: string[]; errors: string[] }> {
    if (!keysOrUrls || keysOrUrls.length === 0) return { deleted: [], errors: [] };

    const normalizedKeys = Array.from(new Set(keysOrUrls.map(k => this.normalizeStorageKey(k)).filter(Boolean)));
    if (normalizedKeys.length === 0) return { deleted: [], errors: [] };

    const deleted: string[] = [];
    const errors: string[] = [];

    // 1. Primary: S3 / Backblaze B2 batch deletion
    if (this.s3) {
      try {
        for (let i = 0; i < normalizedKeys.length; i += 1000) {
          const batch = normalizedKeys.slice(i, i + 1000);
          const response = await this.s3.send(new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: batch.map(Key => ({ Key })),
              Quiet: false,
            },
          }));

          if (response.Deleted) {
            response.Deleted.forEach(d => { if (d.Key) deleted.push(d.Key); });
          }
          if (response.Errors && response.Errors.length > 0) {
            response.Errors.forEach(e => {
              const msg = `S3 delete error for ${e.Key}: ${e.Code} - ${e.Message}`;
              console.warn(`[StorageService]: ${msg}`);
              errors.push(msg);
            });
          }
        }
        console.log(`[StorageService]: S3/B2 DeleteObjects batch executed: ${deleted.length} deleted, ${errors.length} failed.`);
      } catch (err: any) {
        const msg = `S3/B2 batch deletion critical error: ${err.message}`;
        console.error(`[StorageService]: ${msg}`);
        errors.push(msg);
      }
    }

    // 2. Firebase Storage deletion
    const firebaseBucket = this.getFirebaseBucket();
    if (firebaseBucket) {
      try {
        await Promise.all(normalizedKeys.map(k => firebaseBucket.file(k).delete({ ignoreNotFound: true })));
      } catch (err: any) {
        // Non-blocking fallback
      }
    }

    // 3. Supabase Storage deletion
    try {
      await this.getSupabase().storage.from("clips").remove(normalizedKeys);
    } catch (err: any) {
      console.warn(`[StorageService]: Supabase object deletion error: ${err.message}`);
    }

    // 4. Local filesystem cleanup (temp/jobs/...)
    for (const key of normalizedKeys) {
      try {
        const localCandidates = [
          path.resolve(process.cwd(), 'temp', key),
          path.resolve(process.cwd(), '../../temp', key),
        ];
        for (const lp of localCandidates) {
          if (fs.existsSync(lp)) {
            fs.unlinkSync(lp);
          }
        }
      } catch {}
    }

    return { deleted, errors };
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
