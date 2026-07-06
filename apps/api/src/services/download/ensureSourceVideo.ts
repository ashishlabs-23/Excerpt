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
  reason?: 'local_missing' | 'zero_byte_file' | 'ffprobe_failed';
}

export async function ensureSourceVideo(
  jobId: string,
  videoUrl: string | undefined,
  tempDir: string
): Promise<{ videoPath: string; telemetry: SourceVideoTelemetry }> {
  const videoPath = path.join(tempDir, 'input.mp4');
  const startMs = Date.now();

  const validateMedia = async (filePath: string): Promise<{ valid: boolean, reason?: 'local_missing' | 'zero_byte_file' | 'ffprobe_failed' }> => {
    if (!fs.existsSync(filePath)) return { valid: false, reason: 'local_missing' };
    const stats = fs.statSync(filePath);
    if (stats.size === 0) return { valid: false, reason: 'zero_byte_file' };
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
      if (stdout.includes('video')) return { valid: true };
      return { valid: false, reason: 'ffprobe_failed' };
    } catch {
      return { valid: false, reason: 'ffprobe_failed' };
    }
  };

  const initialCheck = await validateMedia(videoPath);
  if (initialCheck.valid) {
    return {
      videoPath,
      telemetry: { strategy: 'local_cache', downloaded: false, durationMs: Date.now() - startMs }
    };
  }

  if (!videoUrl) {
    throw new Error(`[ensureSourceVideo]: Missing input.mp4 for job ${jobId} and no videoUrl provided in payload to recover it.`);
  }

  console.log(`[ensureSourceVideo]: input.mp4 invalid (${initialCheck.reason}) for job ${jobId}. Downloading from ${videoUrl}...`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const downloader = new DownloadIntelligenceEngine();
  await downloader.executeDownload(videoUrl, videoPath, (percent, speed, eta, strategy) => {});

  const postCheck = await validateMedia(videoPath);
  if (!postCheck.valid) {
    throw new Error(`[ensureSourceVideo]: Failed to recover valid input.mp4 for job ${jobId} after download attempt. Reason: ${postCheck.reason}`);
  }

  const telemetry: SourceVideoTelemetry = { 
    strategy: 'redownload', 
    downloaded: true, 
    durationMs: Date.now() - startMs,
    reason: initialCheck.reason 
  };
  
  const stats = fs.statSync(videoPath);
  
  const eventLog = {
    event: "SOURCE_VIDEO_RECOVERY",
    jobId: jobId,
    renderJobId: "unknown",
    strategy: telemetry.strategy,
    reason: telemetry.reason,
    validated: true,
    durationMs: telemetry.durationMs,
    fileSize: stats.size
  };
  
  console.log(JSON.stringify(eventLog));

  return {
    videoPath,
    telemetry
  };
}
