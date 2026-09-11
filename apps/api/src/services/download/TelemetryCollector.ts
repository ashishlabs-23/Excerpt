import { DownloadAttempt, FailureCategory } from './types';
import { EnvironmentInspector } from './EnvironmentInspector';
import { FailureClassifier } from './FailureClassifier';

export class TelemetryCollector {
  private attempt: Partial<DownloadAttempt> = {};

  constructor(strategyId: string, extractorArgs?: string) {
    this.attempt.strategyId = strategyId;
    this.attempt.client = extractorArgs || 'default';
  }

  public setCommand(command: string[]) {
    this.attempt.command = command;
  }

  public async populateEnvironment() {
    const env = await EnvironmentInspector.getSnapshot();
    this.attempt.ytDlpVersion = env.ytDlpVersion;
    this.attempt.ffmpegVersion = env.ffmpegVersion;
    this.attempt.pythonVersion = env.pythonVersion;
    this.attempt.environment = {
      node: env.nodeVersion,
      os: env.os,
      arch: env.arch,
      cpu: env.cpu,
      memory: env.memory,
      timezone: env.timezone
    };
  }

  public recordSuccess(durationMs: number, downloadSpeedMbps?: number, timings?: any) {
    this.attempt.result = 'success';
    this.attempt.duration_ms = durationMs;
    this.attempt.downloadSpeedMbps = downloadSpeedMbps;
    this.attempt.timings = timings;
  }

  public recordMediaInfo(info: {
    selectedHeight?: number;
    selectedWidth?: number;
    selectedVideoCodec?: string;
    selectedAudioCodec?: string;
    selectedFormatId?: string;
    isLowResolutionSource?: boolean;
  }) {
    if (info.selectedHeight !== undefined) this.attempt.selectedHeight = info.selectedHeight;
    if (info.selectedWidth !== undefined) this.attempt.selectedWidth = info.selectedWidth;
    if (info.selectedVideoCodec !== undefined) this.attempt.selectedVideoCodec = info.selectedVideoCodec;
    if (info.selectedAudioCodec !== undefined) this.attempt.selectedAudioCodec = info.selectedAudioCodec;
    if (info.selectedFormatId !== undefined) this.attempt.selectedFormatId = info.selectedFormatId;
    if (info.isLowResolutionSource !== undefined) this.attempt.isLowResolutionSource = info.isLowResolutionSource;
  }

  public recordFailure(durationMs: number, errorMsg: string, timings?: any) {
    const httpStatus = FailureClassifier.extractHttpStatus(errorMsg);
    this.attempt.httpStatus = httpStatus;
    this.attempt.failureCategory = FailureClassifier.classify(errorMsg, httpStatus);
    
    this.attempt.result = `failed (${this.attempt.failureCategory})`;
    this.attempt.duration_ms = durationMs;
    this.attempt.timings = timings;
    
    // Extract last 500 characters of stderr for debugging
    this.attempt.stderr_tail = errorMsg.length > 500 ? errorMsg.substring(errorMsg.length - 500) : errorMsg;
  }

  public build(): DownloadAttempt {
    return this.attempt as DownloadAttempt;
  }
}
