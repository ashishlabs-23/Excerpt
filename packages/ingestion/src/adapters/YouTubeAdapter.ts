import { InputAdapter, InputAdapterConfig, MediaArtifact, MediaSource, PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import { assertSsrfSafe, Logger } from '@excerpt/shared';
import { StrategyRunner } from '../youtube/StrategyRunner';
import { Prober } from '../probe/Prober';
import { IdempotencyUtils } from '../utils/idempotency';
import { join } from 'path';
import { stat } from 'fs/promises';

export class YouTubeAdapter implements InputAdapter {
  async acquire(source: MediaSource, config: InputAdapterConfig, logger: Logger): Promise<MediaArtifact> {
    if (source.type !== 'youtube') throw new Error('Invalid source type for YouTubeAdapter');

    // 1. SSRF Guard
    await assertSsrfSafe(source.urlOrPath);

    // 2. Canonical Identity
    const videoId = IdempotencyUtils.getYouTubeVideoId(source.urlOrPath);
    if (!videoId) {
      throw new PipelineError(PipelineErrorCode.DownloadFailed, 'Invalid YouTube URL');
    }

    const destinationPath = join(config.outputDirectory, `${videoId}.mp4`);

    // 3. Acquire
    try {
      await stat(destinationPath);
      logger.info('File already exists, skipping download', { meta: { destinationPath } });
    } catch {
      await StrategyRunner.downloadWithFallbacks(source.urlOrPath, destinationPath, config, logger);
    }

    // 4. Validate Success Contract
    let stats;
    try {
      stats = await stat(destinationPath);
    } catch (e) {
      throw new PipelineError(PipelineErrorCode.DownloadFailed, 'File does not exist after download');
    }

    if (stats.size === 0) {
      throw new PipelineError(PipelineErrorCode.DownloadFailed, 'Downloaded file is empty (zero bytes)');
    }

    const probeResult = await Prober.probe(destinationPath);

    if (probeResult.durationMs <= 0) {
      throw new PipelineError(PipelineErrorCode.DownloadFailed, 'Downloaded file has zero duration');
    }

    if (!probeResult.videoStream) {
      throw new PipelineError(PipelineErrorCode.DownloadFailed, 'Downloaded file has no video stream');
    }

    const hasAudio = !!probeResult.audioStream;
    // Audio Policy: Audio-only inputs are rejected (caught by no video stream above).
    // Video-only inputs are allowed (hasAudio = false).

    // 5. Normalize
    const checksumSha256 = await IdempotencyUtils.computeFileChecksum(destinationPath);

    return {
      sourceType: 'youtube',
      originalUrlOrPath: source.urlOrPath,
      localPath: destinationPath,
      mimeType: 'video/mp4',
      fileSizeBytes: stats.size,
      durationMs: probeResult.durationMs,
      width: probeResult.videoStream.width,
      height: probeResult.videoStream.height,
      fps: probeResult.videoStream.fps,
      videoCodec: probeResult.videoStream.codec,
      audioCodec: probeResult.audioStream?.codec,
      hasVideoStream: true,
      hasAudioStream: hasAudio,
      hasAudio,
      checksumSha256
    };
  }
}
