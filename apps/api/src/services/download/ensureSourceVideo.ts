import fs from 'fs';
import path from 'path';
import { DownloadIntelligenceEngine } from './DownloadEngine';

/**
 * Ensures the source video is available locally on the machine.
 * If the file is missing (e.g. wiped by ephemeral storage or distributed workers),
 * it restores it by re-downloading from the source URL or shared storage.
 */
export interface SourceVideoTelemetry {
  strategy: 'local_cache' | 'redownload';
  downloaded: boolean;
  durationMs: number;
}

export async function ensureSourceVideo(
  jobId: string,
  videoUrl: string | undefined,
  tempDir: string
): Promise<{ videoPath: string; telemetry: SourceVideoTelemetry }> {
  const videoPath = path.join(tempDir, 'input.mp4');
  const startMs = Date.now();

  const validateMedia = async (filePath: string) => {
    if (!fs.existsSync(filePath)) return false;
    const stats = fs.statSync(filePath);
    if (stats.size === 0) return false;
    try {
      const { execFile } = require('child_process');
      const util = require('util');
      const execFileAsync = util.promisify(execFile);
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'stream=codec_type',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ]);
      return stdout.includes('video');
    } catch {
      return false;
    }
  };

  if (await validateMedia(videoPath)) {
    return {
      videoPath,
      telemetry: { strategy: 'local_cache', downloaded: false, durationMs: Date.now() - startMs }
    };
  }

  if (!videoUrl) {
    throw new Error(`[ensureSourceVideo]: Missing input.mp4 for job ${jobId} and no videoUrl provided in payload to recover it.`);
  }

  console.log(`[ensureSourceVideo]: input.mp4 missing for job ${jobId}. Downloading from ${videoUrl}...`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const downloader = new DownloadIntelligenceEngine();
  await downloader.executeDownload(videoUrl, videoPath, (percent, speed, eta, strategy) => {});

  if (!(await validateMedia(videoPath))) {
    throw new Error(`[ensureSourceVideo]: Failed to recover valid input.mp4 for job ${jobId} after download attempt.`);
  }

  return {
    videoPath,
    telemetry: { strategy: 'redownload', downloaded: true, durationMs: Date.now() - startMs }
  };
}
