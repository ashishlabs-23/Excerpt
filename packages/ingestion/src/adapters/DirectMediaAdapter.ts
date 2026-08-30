import { InputAdapter, InputAdapterConfig, MediaArtifact, MediaSource, PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import { assertSsrfSafe, Logger } from '@excerpt/shared';
import { Prober } from '../probe/Prober';
import { IdempotencyUtils } from '../utils/idempotency';
import { DownloadUtils } from '../utils/download';
import { join } from 'path';
import { stat } from 'fs/promises';
import crypto from 'crypto';

export class DirectMediaAdapter implements InputAdapter {
  async acquire(source: MediaSource, config: InputAdapterConfig, logger: Logger): Promise<MediaArtifact> {
    if (source.type !== 'direct') throw new Error('Invalid source type for DirectMediaAdapter');

    // 1. SSRF Guard
    await assertSsrfSafe(source.urlOrPath);

    // 2. Canonical Identity (Using hash of URL for local filename)
    const urlHash = crypto.createHash('md5').update(source.urlOrPath).digest('hex');
    const ext = source.urlOrPath.toLowerCase().endsWith('.webm') ? 'webm' : 'mp4';
    const destinationPath = join(config.outputDirectory, `${urlHash}.${ext}`);

    // 3. Acquire
    try {
      await stat(destinationPath);
      logger.info('File already exists, skipping download', { meta: { destinationPath } });
    } catch {
      await DownloadUtils.downloadBounded(source.urlOrPath, destinationPath, config.maxSizeBytes);
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
      if (probeResult.audioStream) {
        throw new PipelineError(PipelineErrorCode.UnsupportedMediaType, 'Audio-only direct media is not supported');
      }
      throw new PipelineError(PipelineErrorCode.DownloadFailed, 'Downloaded file has no video stream');
    }

    const hasAudio = !!probeResult.audioStream;

    // 5. Normalize
    const checksumSha256 = await IdempotencyUtils.computeFileChecksum(destinationPath);

    return {
      sourceType: 'direct',
      originalUrlOrPath: source.urlOrPath,
      localPath: destinationPath,
      mimeType: ext === 'webm' ? 'video/webm' : 'video/mp4',
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
