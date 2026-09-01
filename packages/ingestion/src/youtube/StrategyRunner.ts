import { Logger, runWithTimeout } from '@excerpt/shared';
import { PipelineError, PipelineErrorCode, InputAdapterConfig } from '@excerpt/clipping-core';
import { spawn, ChildProcess } from 'child_process';
import { stat } from 'fs/promises';

export type YouTubeStrategy = 'android' | 'ios' | 'mweb' | 'web-cookies' | 'tv-cookies';

export interface StrategyTelemetry {
  strategy: YouTubeStrategy;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exitCode: number | null;
  bytesDownloaded: number;
  errorCategory?: string;
  errorMessage?: string;
}

export class StrategyRunner {
  // Ordered fallback chain
  private static readonly STRATEGY_CHAIN: YouTubeStrategy[] = [
    'android', 'ios', 'mweb', 'web-cookies', 'tv-cookies'
  ];

  static async downloadWithFallbacks(
    url: string,
    destinationPath: string,
    config: InputAdapterConfig,
    logger: Logger
  ): Promise<StrategyTelemetry[]> {
    const telemetryHistory: StrategyTelemetry[] = [];
    let success = false;
    let lastError: PipelineError | null = null;

    for (const strategy of this.STRATEGY_CHAIN) {
      logger.info(`Attempting YouTube download with strategy: ${strategy}`);
      
      const telemetry: StrategyTelemetry = {
        strategy,
        startedAt: new Date().toISOString(),
        endedAt: '',
        durationMs: 0,
        exitCode: null,
        bytesDownloaded: 0
      };
      const startTime = Date.now();

      try {
        await this.executeStrategy(url, destinationPath, strategy, config, telemetry);
        success = true;
        
        telemetry.endedAt = new Date().toISOString();
        telemetry.durationMs = Date.now() - startTime;
        telemetryHistory.push(telemetry);
        
        logger.info(`Strategy ${strategy} succeeded`, { meta: { telemetry } });
        break; // Exit the fallback chain on success
      } catch (err: any) {
        telemetry.endedAt = new Date().toISOString();
        telemetry.durationMs = Date.now() - startTime;
        telemetry.errorCategory = err instanceof PipelineError ? err.code : 'UNKNOWN_ERROR';
        telemetry.errorMessage = err.message;
        
        telemetryHistory.push(telemetry);
        logger.warn(`Strategy ${strategy} failed`, { meta: { telemetry } });
        
        lastError = err instanceof PipelineError ? err : new PipelineError(PipelineErrorCode.DownloadFailed, err.message);
      }
    }

    if (!success) {
      // Throw with all telemetry metadata so we don't just say "all failed"
      throw new PipelineError(
        PipelineErrorCode.DownloadFailed, 
        'All YouTube strategies exhausted',
        { strategyHistory: telemetryHistory }
      );
    }

    return telemetryHistory;
  }

  private static async executeStrategy(
    url: string,
    destinationPath: string,
    strategy: YouTubeStrategy,
    config: InputAdapterConfig,
    telemetry: StrategyTelemetry
  ): Promise<void> {
    const args = [
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '-o', destinationPath,
    ];

    // Apply strategy-specific yt-dlp args BEFORE the URL (positional arg must be last)
    if (strategy === 'android') {
      args.push('--extractor-args', 'youtube:player_client=android');
    } else if (strategy === 'ios') {
      args.push('--extractor-args', 'youtube:player_client=ios');
    }
    // etc...

    args.push(url); // URL must always be the final positional argument

    const cp = spawn('yt-dlp', args);
    let lastSize = 0;
    let inactivityTimer: NodeJS.Timeout | undefined;
    let sizeViolated = false;
    let inactivityExceeded = false;

    // Watchdog: polls file size every 2s to enforce the size ceiling.
    // IMPORTANT: stat errors (file not yet created) are caught separately so
    // the size-limit PipelineError is never silently swallowed.
    const watchdogs = setInterval(async () => {
      let stats;
      try {
        stats = await stat(destinationPath);
      } catch {
        return; // File might not exist yet — ignore and retry next tick
      }

      if (stats.size > config.maxSizeBytes) {
        clearInterval(watchdogs);
        cp.kill('SIGTERM');
        sizeViolated = true; // Picked up by close handler — avoids throw-inside-catch
        return;
      }

      if (stats.size > lastSize) {
        lastSize = stats.size;
        telemetry.bytesDownloaded = lastSize;
      }
    }, 2000);

    const inactivityTimeoutMs = 15000;
    const resetInactivityTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        clearInterval(watchdogs);
        inactivityExceeded = true; // Picked up by close handler for structured error
        cp.kill('SIGTERM');
      }, inactivityTimeoutMs);
    };

    cp.stdout.on('data', () => resetInactivityTimer());
    cp.stderr.on('data', () => resetInactivityTimer());

    resetInactivityTimer(); // Start the timer

    const runPromise = new Promise<void>((resolve, reject) => {
      cp.on('close', (code) => {
        clearInterval(watchdogs);
        clearTimeout(inactivityTimer);
        telemetry.exitCode = code;

        // Check flags set by watchdog/inactivity before falling back to exit code
        if (sizeViolated) {
          reject(new PipelineError(PipelineErrorCode.ResourceLimitExceeded, `File exceeds size limit of ${config.maxSizeBytes} bytes`));
        } else if (inactivityExceeded) {
          reject(new PipelineError(PipelineErrorCode.Timeout, 'yt-dlp stalled: no output for 15s'));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });
      cp.on('error', (err) => {
        clearInterval(watchdogs);
        clearTimeout(inactivityTimer);
        reject(err);
      });
    });

    try {
      await runWithTimeout(runPromise, config.timeoutMs, { childProcess: cp });
    } catch (err: any) {
      clearInterval(watchdogs);
      clearTimeout(inactivityTimer);
      // Re-throw structured PipelineErrors (Timeout, ResourceLimitExceeded) as-is
      if (err instanceof PipelineError) {
        throw err;
      }
      throw new PipelineError(PipelineErrorCode.DownloadFailed, err.message);
    }
  }
}
