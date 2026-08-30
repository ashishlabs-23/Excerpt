import { InputAdapter, InputAdapterConfig, MediaArtifact, MediaSource, PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import { Logger } from '@excerpt/shared';
import { Prober } from '../probe/Prober';
import { IdempotencyUtils } from '../utils/idempotency';
import { stat } from 'fs/promises';

export class LocalFileAdapter implements InputAdapter {
  async acquire(source: MediaSource, config: InputAdapterConfig, logger: Logger): Promise<MediaArtifact> {
    if (source.type !== 'local') throw new Error('Invalid source type for LocalFileAdapter');

    const filePath = source.urlOrPath;

    // 1. Validate existence
    let stats;
    try {
      stats = await stat(filePath);
    } catch (e) {
      throw new PipelineError(PipelineErrorCode.DownloadFailed, `Local file does not exist: ${filePath}`);
    }

    if (stats.size === 0) {
      throw new PipelineError(PipelineErrorCode.DownloadFailed, 'Local file is empty (zero bytes)');
    }
    
    if (stats.size > config.maxSizeBytes) {
       throw new PipelineError(PipelineErrorCode.ResourceLimitExceeded, `Local file exceeds size limit of ${config.maxSizeBytes} bytes`);
    }

    // 2. Probe
    const probeResult = await Prober.probe(filePath);

    if (probeResult.durationMs <= 0) {
      throw new PipelineError(PipelineErrorCode.DownloadFailed, 'Local file has zero duration');
    }
    
    if (probeResult.durationMs > config.maxDurationMs) {
      throw new PipelineError(PipelineErrorCode.ResourceLimitExceeded, `Local file duration exceeds limit`);
    }

    if (!probeResult.videoStream) {
      if (probeResult.audioStream) {
        throw new PipelineError(PipelineErrorCode.UnsupportedMediaType, 'Audio-only local file is not supported');
      }
      throw new PipelineError(PipelineErrorCode.DownloadFailed, 'Local file has no video stream');
    }

    const hasAudio = !!probeResult.audioStream;

    // 3. Normalize
    const checksumSha256 = await IdempotencyUtils.computeFileChecksum(filePath);
    const ext = filePath.toLowerCase().endsWith('.webm') ? 'webm' : 'mp4';

    return {
      sourceType: 'local',
      originalUrlOrPath: filePath,
      localPath: filePath,
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
