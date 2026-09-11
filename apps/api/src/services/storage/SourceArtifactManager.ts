import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { StorageService } from '../storageService';
import { PipelineError, ErrorCategory } from '@excerpt/clipping-core';
import { getBinaryPath } from '../videoProcessor';

const execFileAsync = promisify(execFile);

export interface SourceIdentity {
  contentHash: string; // SHA-256 of actual file bytes
  canonicalSourceUrl?: string;
}

export interface SourceMediaManifest {
  schemaVersion: '1.0';
  contentHash: string;
  canonicalSourceUrl?: string;
  durationSec: number;
  videoCodec: string;
  audioCodec: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
  storageKey: string; // "sources/<contentHash>/source.mp4"
  manifestKey: string; // "sources/<contentHash>/manifest.json"
  verified: boolean;
  verifiedAt: string;
}

export interface SourceValidationResult {
  valid: boolean;
  durationSec: number;
  videoCodec: string;
  audioCodec: string;
  width: number;
  height: number;
  sizeBytes: number;
  contentHash: string;
  error?: string;
}

/**
 * Calculates SHA-256 cryptographic hash of actual file bytes using streams.
 */
export async function calculateContentHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`File not found for hashing: ${filePath}`));
    }
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

export class SourceArtifactManager {
  private static instance: SourceArtifactManager | null = null;
  private storage: StorageService;

  public static getInstance(): SourceArtifactManager {
    if (!SourceArtifactManager.instance) {
      SourceArtifactManager.instance = new SourceArtifactManager();
    }
    return SourceArtifactManager.instance;
  }

  constructor(storage?: StorageService) {
    this.storage = storage || StorageService.getInstance();
  }

  /**
   * Probes and strictly validates media integrity via ffprobe before publishing.
   */
  public async validateSourceFile(filePath: string): Promise<SourceValidationResult> {
    if (!fs.existsSync(filePath)) {
      throw new PipelineError({
        category: ErrorCategory.DOWNLOAD,
        stage: 'source_validation',
        component: 'SourceArtifactManager',
        message: `Source media file not found on disk: ${filePath}`,
        retryable: false,
        rootCause: 'LOCAL_FILE_MISSING',
      });
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      throw new PipelineError({
        category: ErrorCategory.DOWNLOAD,
        stage: 'source_validation',
        component: 'SourceArtifactManager',
        message: `Source media file is 0 bytes: ${filePath}`,
        retryable: false,
        rootCause: 'ZERO_BYTE_FILE',
      });
    }

    const ffprobeBin = getBinaryPath('ffprobe');
    let stdout = '';
    try {
      const res = await execFileAsync(ffprobeBin, [
        '-v', 'error',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath,
      ]);
      stdout = res.stdout;
    } catch (ffErr: any) {
      throw new PipelineError({
        category: ErrorCategory.FFMPEG,
        stage: 'source_validation',
        component: 'SourceArtifactManager',
        message: `FFprobe failed to decode source media: ${ffErr.message}`,
        retryable: false,
        rootCause: 'FFPROBE_DECODE_FAILED',
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new PipelineError({
        category: ErrorCategory.FFMPEG,
        stage: 'source_validation',
        component: 'SourceArtifactManager',
        message: 'Failed to parse ffprobe JSON output for source media',
        retryable: false,
      });
    }

    const streams = parsed.streams || [];
    const videoStream = streams.find((s: any) => s.codec_type === 'video');
    const audioStream = streams.find((s: any) => s.codec_type === 'audio');

    if (!videoStream) {
      throw new PipelineError({
        category: ErrorCategory.FFMPEG,
        stage: 'source_validation',
        component: 'SourceArtifactManager',
        message: 'No video stream detected in source media file',
        retryable: false,
        rootCause: 'NO_VIDEO_STREAM',
      });
    }

    const durationSec = parseFloat(parsed.format?.duration || videoStream.duration || '0');
    if (durationSec <= 0) {
      throw new PipelineError({
        category: ErrorCategory.FFMPEG,
        stage: 'source_validation',
        component: 'SourceArtifactManager',
        message: `Invalid source media duration: ${durationSec}s`,
        retryable: false,
        rootCause: 'INVALID_DURATION',
      });
    }

    const contentHash = await calculateContentHash(filePath);

    return {
      valid: true,
      durationSec,
      videoCodec: videoStream.codec_name || 'unknown',
      audioCodec: audioStream?.codec_name || 'none',
      width: videoStream.width || 0,
      height: videoStream.height || 0,
      sizeBytes: stats.size,
      contentHash,
    };
  }

  /**
   * Publishes a validated source video to immutable content-addressed object storage:
   * sources/<contentHash>/source.mp4
   * 
   * Idempotent: If the artifact already exists in storage, verifies and reuses it without re-uploading.
   */
  public async publishSourceArtifact(
    localFilePath: string,
    canonicalSourceUrl?: string
  ): Promise<SourceMediaManifest> {
    const validation = await this.validateSourceFile(localFilePath);
    const contentHash = validation.contentHash;
    const storageKey = `sources/${contentHash}/source.mp4`;

    console.log(`[SourceArtifactManager]: Publishing content-addressed source artifact: ${storageKey} (${(validation.sizeBytes / 1024 / 1024).toFixed(2)} MB)`);

    // Check if immutable artifact already exists in object storage
    let alreadyExists = false;
    try {
      const streamRes = await this.storage.getFileStream(storageKey);
      if (streamRes && streamRes.contentLength && streamRes.contentLength > 0) {
        alreadyExists = true;
        console.log(`[SourceArtifactManager]: ⚡ Immutable artifact already published at ${storageKey}. Reusing existing object.`);
      }
    } catch {}

    if (!alreadyExists) {
      console.log(`[SourceArtifactManager]: Uploading immutable source to ${storageKey}...`);
      await this.storage.uploadFile(localFilePath, storageKey);
    }

    // Verify published object
    try {
      const verifyRes = await this.storage.getFileStream(storageKey);
      if (!verifyRes || !verifyRes.contentLength || verifyRes.contentLength === 0) {
        throw new Error(`Verification failed for storage key ${storageKey}`);
      }
    } catch (verErr: any) {
      throw new PipelineError({
        category: ErrorCategory.UPLOAD,
        stage: 'source_publish',
        component: 'SourceArtifactManager',
        message: `Published source artifact verification failed: ${verErr.message}`,
        retryable: true,
        rootCause: 'PUBLISHED_ARTIFACT_UNVERIFIED',
      });
    }

    const manifestKey = `sources/${contentHash}/manifest.json`;
    const manifest: SourceMediaManifest = {
      schemaVersion: '1.0',
      contentHash,
      canonicalSourceUrl,
      durationSec: validation.durationSec,
      videoCodec: validation.videoCodec,
      audioCodec: validation.audioCodec,
      width: validation.width,
      height: validation.height,
      sizeBytes: validation.sizeBytes,
      mimeType: 'video/mp4',
      storageKey,
      manifestKey,
      verified: true,
      verifiedAt: new Date().toISOString(),
    };

    // Publish manifest.json to Object Storage alongside source.mp4
    try {
      const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
      const manifestStream = Readable.from(manifestBuffer);
      await this.storage.uploadStream(manifestStream, manifestKey, 'application/json', manifestBuffer.length);
      console.log(`[SourceArtifactManager]: ✅ Source manifest published at ${manifestKey}`);
    } catch (manErr: any) {
      console.warn(`[SourceArtifactManager]: Failed to write manifest object (source.mp4 remains intact): ${manErr.message}`);
    }

    return manifest;
  }

  /**
   * Fetches and parses the source manifest from Object Storage.
   */
  public async getManifest(contentHash: string): Promise<SourceMediaManifest | null> {
    const manifestKey = `sources/${contentHash}/manifest.json`;
    try {
      const streamRes = await this.storage.getFileStream(manifestKey);
      if (!streamRes?.stream) return null;

      const chunks: Buffer[] = [];
      for await (const chunk of streamRes.stream) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const rawJson = Buffer.concat(chunks).toString('utf-8');
      return JSON.parse(rawJson) as SourceMediaManifest;
    } catch {
      return null;
    }
  }

  /**
   * Acquires local access to the immutable source video artifact for render workers.
   * Pulls from local cache first, or streams from Object Storage.
   * Render workers NEVER call YouTube or external media URLs directly.
   */
  public async acquireLocalSource(
    manifestOrKey: SourceMediaManifest | string,
    targetDir: string
  ): Promise<{ localPath: string; cacheHit: boolean }> {
    const storageKey = typeof manifestOrKey === 'string' ? manifestOrKey : manifestOrKey.storageKey;
    const contentHash = typeof manifestOrKey === 'string'
      ? storageKey.split('/')[1] || storageKey
      : manifestOrKey.contentHash;

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const localTarget = path.join(targetDir, 'input.mp4');

    // 1. Check if local target already exists and is valid
    if (fs.existsSync(localTarget)) {
      try {
        const check = await this.validateSourceFile(localTarget);
        if (check.contentHash === contentHash || !contentHash) {
          console.log(`[SourceArtifactManager]: ⚡ Local target hit for ${storageKey} at ${localTarget}`);
          return { localPath: localTarget, cacheHit: true };
        }
      } catch {}
    }

    // 2. Check candidate global cache paths
    const candidatePaths = [
      path.resolve(process.cwd(), 'temp/cache', contentHash, 'source.mp4'),
      path.resolve(process.cwd(), 'temp/cache', contentHash, 'input.mp4'),
      path.resolve(process.cwd(), 'apps/api/temp/cache', contentHash, 'source.mp4'),
    ];

    for (const candidate of candidatePaths) {
      if (fs.existsSync(candidate)) {
        try {
          const check = await this.validateSourceFile(candidate);
          if (check.contentHash === contentHash) {
            console.log(`[SourceArtifactManager]: 🧠 Content cache hit at ${candidate}. Linking to ${localTarget}`);
            fs.copyFileSync(candidate, localTarget);
            return { localPath: localTarget, cacheHit: true };
          }
        } catch {}
      }
    }

    // 3. Stream from Object Storage
    console.log(`[SourceArtifactManager]: 🛰️ Streaming immutable source from storage: ${storageKey} -> ${localTarget}`);
    const streamResult = await this.storage.getFileStream(storageKey);
    if (!streamResult || !streamResult.stream) {
      throw new PipelineError({
        category: ErrorCategory.UPLOAD,
        stage: 'source_acquisition',
        component: 'SourceArtifactManager',
        message: `Immutable source artifact not found in storage: ${storageKey}`,
        retryable: false,
        rootCause: 'SOURCE_ARTIFACT_NOT_FOUND',
      });
    }

    const outStream = fs.createWriteStream(localTarget);
    await new Promise<void>((resolve, reject) => {
      streamResult.stream.pipe(outStream);
      outStream.on('finish', () => resolve());
      outStream.on('error', (err) => reject(err));
      streamResult.stream.on('error', (err: any) => reject(err));
    });

    // Validate downloaded file
    const postDownloadValidation = await this.validateSourceFile(localTarget);
    if (contentHash && postDownloadValidation.contentHash !== contentHash) {
      throw new PipelineError({
        category: ErrorCategory.UPLOAD,
        stage: 'source_acquisition',
        component: 'SourceArtifactManager',
        message: `Downloaded source file checksum mismatch: expected ${contentHash}, got ${postDownloadValidation.contentHash}`,
        retryable: true,
        rootCause: 'SOURCE_CHECKSUM_MISMATCH',
      });
    }

    console.log(`[SourceArtifactManager]: ✅ Source acquired successfully: ${localTarget} (${(postDownloadValidation.sizeBytes / 1024 / 1024).toFixed(2)} MB)`);
    return { localPath: localTarget, cacheHit: false };
  }
}
