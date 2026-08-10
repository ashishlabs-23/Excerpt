import { execFile } from 'child_process';
import fs from 'fs';
import { MediaArtifact, SourceInputType } from './MediaArtifact';
import { PipelineError, ErrorCategory } from '../types/errorTaxonomy';

export class ArtifactValidator {
  /**
   * Runs ffprobe validation and constructs a canonical MediaArtifact.
   * Throws a PipelineError if the file is missing, empty, or corrupt.
   */
  public static async validateAndBuildArtifact(
    localPath: string,
    sourceUrl: string,
    sourceType: SourceInputType,
    jobId?: string
  ): Promise<MediaArtifact> {
    if (!fs.existsSync(localPath)) {
      throw new PipelineError({
        category: ErrorCategory.DOWNLOAD,
        message: `DOWNLOAD_CORRUPT_ARTIFACT: File does not exist at ${localPath}`,
        stage: 'download_validation',
        jobId,
        retryable: false
      });
    }

    const stat = fs.statSync(localPath);
    if (stat.size < 1000) {
      throw new PipelineError({
        category: ErrorCategory.DOWNLOAD,
        message: `DOWNLOAD_CORRUPT_ARTIFACT: Downloaded file size too small (${stat.size} bytes)`,
        stage: 'download_validation',
        jobId,
        retryable: false
      });
    }

    if (/\.(part|ytdl)$/i.test(localPath)) {
      throw new PipelineError({
        category: ErrorCategory.DOWNLOAD,
        message: `DOWNLOAD_CORRUPT_ARTIFACT: Download completed as temporary part file (${localPath})`,
        stage: 'download_validation',
        jobId,
        retryable: false
      });
    }

    const probeData = await this.runFfprobe(localPath);
    const durationSec = parseFloat(probeData.format?.duration || '0');
    
    if (isNaN(durationSec) || durationSec <= 0) {
      throw new PipelineError({
        category: ErrorCategory.DOWNLOAD,
        message: `DOWNLOAD_CORRUPT_ARTIFACT: ffprobe reported invalid duration (${durationSec}s)`,
        stage: 'download_validation',
        jobId,
        retryable: false
      });
    }

    const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');

    if (!videoStream && !audioStream) {
      throw new PipelineError({
        category: ErrorCategory.DOWNLOAD,
        message: `DOWNLOAD_CORRUPT_ARTIFACT: No valid video or audio streams found in container`,
        stage: 'download_validation',
        jobId,
        retryable: false
      });
    }

    return {
      id: jobId || `media_${Date.now()}`,
      sourceType,
      sourceUrl,
      storagePath: localPath,
      localPath,
      durationSec,
      width: videoStream?.width || 1280,
      height: videoStream?.height || 720,
      fps: eval(videoStream?.r_frame_rate || '30') || 30,
      videoCodec: videoStream?.codec_name || 'unknown',
      audioCodec: audioStream?.codec_name || 'unknown',
      hasAudio: Boolean(audioStream),
      sampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : undefined,
      channels: audioStream?.channels,
      fileSizeBytes: stat.size,
      metadata: probeData.format?.tags || {}
    };
  }

  private static runFfprobe(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const bin = process.env.FFPROBE_PATH || 'ffprobe';
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ];

      execFile(bin, args, { timeout: 15000 }, (err, stdout) => {
        if (err) return reject(err);
        try {
          resolve(JSON.parse(stdout));
        } catch (jsonErr) {
          reject(jsonErr);
        }
      });
    });
  }
}
