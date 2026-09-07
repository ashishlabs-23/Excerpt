import fs from 'fs';
import path from 'path';
import { VideoProcessor } from '../../services/videoProcessor';
import { PipelineError, ErrorCategory, ArtifactValidator } from '@excerpt/clipping-core';
import { PipelineStage, StageResult } from './types';

export interface IngestionInput {
  jobId: string;
  videoUrl: string;
  tempDir: string;
  cacheDir: string;
  onProgress?: (progress: number, label: string) => Promise<void>;
}

export interface IngestionOutput {
  inputPath: string;
  sourceDuration: number;
  dimensions: { width: number; height: number };
  cachedInputPath: string;
  attempts?: any[];
}

export class IngestionStage implements PipelineStage<IngestionInput, IngestionOutput> {
  readonly name = 'stage_0_ingestion';
  private processor = new VideoProcessor();

  async execute(input: IngestionInput): Promise<StageResult<IngestionOutput>> {
    const startedAt = Date.now();
    const inputPath = path.join(input.tempDir, 'source.mp4');
    const cachedInputPath = path.join(input.cacheDir, 'source.mp4');

    try {
      if (fs.existsSync(input.videoUrl)) {
        console.log(`[IngestionStage]: Processing direct local input from ${input.videoUrl}`);
        fs.copyFileSync(input.videoUrl, inputPath);
      } else if (fs.existsSync(cachedInputPath)) {
        console.log(`[IngestionStage]: Cache hit — reusing source from ${cachedInputPath}`);
        fs.copyFileSync(cachedInputPath, inputPath);
      } else {
        console.log(`[IngestionStage]: Ingesting remote source from ${input.videoUrl}`);
        const dlResult = await this.processor.downloadVideo(
          input.videoUrl,
          cachedInputPath,
          async (percent: number, speed?: string, eta?: string) => {
            if (input.onProgress) {
              const label = percent > 0
                ? `Downloading HD source: ${Math.round(percent)}%${speed ? ` (${speed})` : ''}${eta ? ` • ETA ${eta}` : ''}`
                : 'Connecting to video stream & downloading HD source...';
              await input.onProgress(Math.min(40, Math.max(10, Math.floor(10 + (percent * 0.3)))), label);
            }
          }
        );

        const resolvedSource = (dlResult?.outputPath && fs.existsSync(dlResult.outputPath))
          ? dlResult.outputPath
          : (fs.existsSync(cachedInputPath) ? cachedInputPath : null);

        if (!resolvedSource) {
          throw new PipelineError({
            category: ErrorCategory.DOWNLOAD,
            message: `Download completed but output media file was not found on disk at ${cachedInputPath}`,
            stage: 'download',
            jobId: input.jobId,
            retryable: false,
          });
        }

        fs.copyFileSync(resolvedSource, inputPath);
      }

      // Validate downloaded artifact via canonical clipping-core validator
      const isLocal = fs.existsSync(input.videoUrl);
      const isYouTube = input.videoUrl.includes('youtube') || input.videoUrl.includes('youtu.be');
      const sourceType = isLocal ? 'uploaded_mp4' : (isYouTube ? 'youtube_url' : 'direct_mp4_url');

      const artifact = await ArtifactValidator.validateAndBuildArtifact(
        inputPath,
        input.videoUrl,
        sourceType,
        input.jobId
      );

      return {
        success: true,
        data: {
          inputPath,
          sourceDuration: artifact.durationSec,
          dimensions: {
            width: artifact.width,
            height: artifact.height,
          },
          cachedInputPath,
        },
        durationMs: Date.now() - startedAt,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err instanceof PipelineError ? err : new PipelineError({
          category: ErrorCategory.DOWNLOAD,
          message: err.message || 'Ingestion stage failed',
          stage: 'download',
          jobId: input.jobId,
          retryable: false,
          rawError: err,
        }),
        durationMs: Date.now() - startedAt,
      };
    }
  }
}
