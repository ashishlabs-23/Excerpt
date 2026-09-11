import fs from 'fs';
import path from 'path';
import { SourceArtifactManager } from '../storage/SourceArtifactManager';
import { PipelineError, ErrorCategory } from '@excerpt/clipping-core';

/**
 * Ensures the source video is available locally on the machine for renderWorker.
 * Conforms to P4.2 Media Locality Invariant:
 * 1. Checks local fast-cache candidate paths.
 * 2. If missing, fetches the immutable source artifact from Object Storage (sources/<contentHash>/source.mp4).
 * 3. Render workers NEVER call external YouTube / HTTP download engines.
 */
export interface SourceVideoTelemetry {
  strategy: 'local_cache' | 'storage_artifact';
  downloaded: boolean;
  durationMs: number;
  contentHash?: string;
  reason?: 'local_missing' | 'zero_byte_file' | 'ffprobe_failed';
}

export async function ensureSourceVideo(
  jobId: string,
  videoUrlOrStorageKey: string | undefined,
  tempDir: string,
  contentHash?: string
): Promise<{ videoPath: string; telemetry: SourceVideoTelemetry }> {
  const startMs = Date.now();
  const sourceManager = SourceArtifactManager.getInstance();

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const localVideoPath = path.join(tempDir, 'input.mp4');

  // 1. Fast path: check if valid file already exists in local tempDir
  if (fs.existsSync(localVideoPath)) {
    try {
      const validation = await sourceManager.validateSourceFile(localVideoPath);
      if (validation.valid && (!contentHash || validation.contentHash === contentHash)) {
        return {
          videoPath: localVideoPath,
          telemetry: {
            strategy: 'local_cache',
            downloaded: false,
            durationMs: Date.now() - startMs,
            contentHash: validation.contentHash,
          },
        };
      }
    } catch {}
  }

  // 2. Determine storage key: prefer sources/<contentHash>/source.mp4
  let storageKey = '';
  if (videoUrlOrStorageKey && videoUrlOrStorageKey.startsWith('sources/')) {
    storageKey = videoUrlOrStorageKey;
  } else if (contentHash) {
    storageKey = `sources/${contentHash}/source.mp4`;
  }

  // 3. Acquire from Object Storage via SourceArtifactManager
  try {
    const keyToFetch = storageKey || (contentHash ? `sources/${contentHash}/source.mp4` : '');
    if (keyToFetch) {
      if (contentHash) {
        const manifest = await sourceManager.getManifest(contentHash);
        if (manifest) {
          console.log(`[ensureSourceVideo]: Found verified source manifest for hash ${contentHash} (${manifest.durationSec}s, ${manifest.width}x${manifest.height})`);
        }
      }
      console.log(`[ensureSourceVideo]: Acquiring source media from storage: ${keyToFetch} for job ${jobId}`);
      const acquired = await sourceManager.acquireLocalSource(keyToFetch, tempDir);
      return {
        videoPath: acquired.localPath,
        telemetry: {
          strategy: acquired.cacheHit ? 'local_cache' : 'storage_artifact',
          downloaded: !acquired.cacheHit,
          durationMs: Date.now() - startMs,
          contentHash,
        },
      };
    }
  } catch (storageErr: any) {
    console.warn(`[ensureSourceVideo]: Storage acquisition warning: ${storageErr.message}`);
  }

  // 4. Candidate directory fallback (local container volumes)
  const candidatePaths = [
    path.resolve(process.cwd(), 'temp', jobId, 'input.mp4'),
    path.resolve(process.cwd(), 'apps/api/temp', jobId, 'input.mp4'),
    path.resolve(__dirname, '../../../../temp', jobId, 'input.mp4'),
  ];

  if (contentHash) {
    candidatePaths.push(
      path.resolve(process.cwd(), 'temp/cache', contentHash, 'source.mp4'),
      path.resolve(process.cwd(), 'temp/cache', contentHash, 'input.mp4')
    );
  }

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        const validation = await sourceManager.validateSourceFile(candidate);
        if (validation.valid) {
          console.log(`[ensureSourceVideo]: Found valid local source at ${candidate}`);
          fs.copyFileSync(candidate, localVideoPath);
          return {
            videoPath: localVideoPath,
            telemetry: {
              strategy: 'local_cache',
              downloaded: false,
              durationMs: Date.now() - startMs,
              contentHash: validation.contentHash,
            },
          };
        }
      } catch {}
    }
  }

  // If source is missing from both local disk and object storage: fail fast!
  // RENDER WORKERS MUST NEVER CALL YOUTUBE DIRECTLY.
  throw new PipelineError({
    category: ErrorCategory.DOWNLOAD,
    stage: 'source_acquisition',
    component: 'ensureSourceVideo',
    message: `[ensureSourceVideo]: Source media missing for job ${jobId}. Artifact not found in local cache or storage at ${storageKey || 'sources/<contentHash>/source.mp4'}`,
    retryable: false,
    rootCause: 'IMMUTABLE_SOURCE_MISSING',
  });
}
