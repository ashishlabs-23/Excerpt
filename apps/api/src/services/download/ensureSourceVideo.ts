import fs from 'fs';
import path from 'path';
import { DownloadIntelligenceEngine } from './DownloadEngine';

/**
 * Ensures the source video is available locally on the machine.
 * If the file is missing (e.g. wiped by ephemeral storage or distributed workers),
 * it restores it by re-downloading from the source URL or shared storage.
 */
export async function ensureSourceVideo(
  jobId: string,
  videoUrl: string | undefined,
  tempDir: string
): Promise<string> {
  const videoPath = path.join(tempDir, 'input.mp4');

  if (fs.existsSync(videoPath)) {
    return videoPath;
  }

  if (!videoUrl) {
    throw new Error(`[ensureSourceVideo]: Missing input.mp4 for job ${jobId} and no videoUrl provided in payload to recover it.`);
  }

  console.log(`[ensureSourceVideo]: input.mp4 missing for job ${jobId}. Downloading from ${videoUrl}...`);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const downloader = new DownloadIntelligenceEngine();
  await downloader.executeDownload(videoUrl, videoPath, (percent, speed, eta, strategy) => {
    // Optional progress logging could go here if needed.
  });

  if (!fs.existsSync(videoPath)) {
    throw new Error(`[ensureSourceVideo]: Failed to recover input.mp4 for job ${jobId} after download attempt.`);
  }

  return videoPath;
}
