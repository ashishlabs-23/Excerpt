import { MediaArtifact, MediaValidationReport, PipelineError, PipelineErrorCode, CostEntry } from '@excerpt/clipping-core';
import { Logger, runWithTimeout } from '@excerpt/shared';
import { stat } from 'fs/promises';
import { spawn } from 'child_process';
import { ValidationRules } from './rules';

export class MediaValidator {
  constructor(private logger: Logger) {}

  async validate(artifact: MediaArtifact): Promise<MediaValidationReport> {
    const fatalErrors: PipelineError[] = [];
    const warnings = [];

    // 1. File Existence & Size
    let stats;
    try {
      stats = await stat(artifact.localPath);
      if (stats.size === 0) {
        fatalErrors.push(new PipelineError(PipelineErrorCode.ValidationError, 'File is empty'));
      }
    } catch (e) {
      fatalErrors.push(new PipelineError(PipelineErrorCode.ValidationError, 'File does not exist'));
      return this.generateReport(artifact, fatalErrors, [], null);
    }

    // 2. Deep Corruption/Adversarial Detection via ffprobe
    // Run a thorough probe reading all packets to find truncated or malformed files
    const probeResult = await this.deepProbe(artifact.localPath);
    
    if (probeResult.error) {
      fatalErrors.push(new PipelineError(PipelineErrorCode.ValidationError, `Corruption detected: ${probeResult.error}`));
      return this.generateReport(artifact, fatalErrors, [], null);
    }

    // 3. Rule Evaluation
    const ruleEvaluation = ValidationRules.evaluate(artifact, probeResult.data);
    fatalErrors.push(...ruleEvaluation.fatalErrors);
    warnings.push(...ruleEvaluation.warnings);

    // 4. Cost Estimation
    const estimatedCostUsd = this.estimateCost(artifact);

    return this.generateReport(artifact, fatalErrors, warnings, probeResult.data, estimatedCostUsd);
  }

  private async deepProbe(filePath: string): Promise<{ error?: string; data?: any }> {
    // -v error: Only show errors
    // -show_error: Show error in JSON
    // -show_format, -show_streams
    // -count_packets: Forces ffprobe to read through the file, catching mid-file truncation or adversarial boxes
    const args = [
      '-v', 'error',
      '-show_error',
      '-show_format',
      '-show_streams',
      '-count_packets',
      '-of', 'json',
      filePath
    ];

    const cp = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';

    cp.stdout.on('data', d => stdout += d.toString());
    cp.stderr.on('data', d => stderr += d.toString());

    const runPromise = new Promise<void>((resolve, reject) => {
      cp.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
      });
      cp.on('error', reject);
    });

    try {
      // 30 seconds timeout, strict kill tree
      await runWithTimeout(runPromise, 30000, { childProcess: cp });
    } catch (err: any) {
      // Could be timeout or exit code failure
      if (err instanceof PipelineError && err.code === PipelineErrorCode.Timeout) {
        return { error: 'Validation timed out, possible adversarial input' };
      }
      return { error: `FFprobe failed: ${err.message}` };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch (e) {
      return { error: 'Failed to parse ffprobe output' };
    }

    if (parsed.error) {
      return { error: `FFprobe reported error: ${parsed.error.string}` };
    }

    const videoStream = parsed.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = parsed.streams?.find((s: any) => s.codec_type === 'audio');

    return { 
      data: { 
        format: parsed.format,
        videoStream,
        audioStream
      } 
    };
  }

  private estimateCost(artifact: MediaArtifact): number {
    // e.g. 0.01 USD per minute of processing
    const minutes = artifact.durationMs / 60000;
    // Base cost for ingestion/validation + duration cost
    return 0.005 + (minutes * 0.01);
  }

  private generateReport(
    artifact: MediaArtifact, 
    fatalErrors: PipelineError[], 
    warnings: any[], 
    probeData: any,
    estimatedProcessingCostUsd: number = 0
  ): MediaValidationReport {
    return {
      valid: fatalErrors.length === 0,
      fatalErrors,
      warnings,
      metadata: probeData?.format || {},
      streams: {
        video: probeData?.videoStream,
        audio: probeData?.audioStream
      },
      durationMs: artifact.durationMs,
      resolution: {
        width: artifact.width || 0,
        height: artifact.height || 0
      },
      codec: {
        video: artifact.videoCodec || 'unknown',
        audio: artifact.audioCodec
      },
      estimatedProcessingCostUsd
    };
  }
}
