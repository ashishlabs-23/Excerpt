import { execFile, spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { assertSafeRemoteVideoUrl } from '../urlSafety';
import { withYtDlpCookies } from '../../lib/cookieHelper';
import { getBinaryPath } from '../videoProcessor'; 
import { StrategyManager } from './StrategyManager';
import { TelemetryCollector } from './TelemetryCollector';
import { DownloadStrategy, DownloadAttempt } from './types';
import { EnvProxyProvider } from './ProxyProvider';

export class DownloadIntelligenceEngine {
  private strategyManager = new StrategyManager();
  private proxyProvider = new EnvProxyProvider();
  
  private readonly THROTTLE_THRESHOLD_BPS = 100 * 1024;
  private readonly THROTTLE_TIME_LIMIT_MS = 15000; 

  private getYtDlpOptionalArgs(cookiesPath: string | null, strategy: DownloadStrategy): string[] {
    const args: string[] = [];
    if (strategy.useCookies && cookiesPath) {
      args.push('--cookies', cookiesPath);
    }
    const proxyUrl = strategy.proxyProvider?.getProxyUrl() || this.proxyProvider.getProxyUrl();
    if (proxyUrl) {
      args.push('--proxy', proxyUrl);
    }
    return args;
  }

  public async probeDuration(url: string): Promise<number | null> {
    try {
      const bin = getBinaryPath('yt-dlp');
      return await new Promise((resolve) => {
        execFile(bin, ['--print', 'duration', '--no-playlist', url], { timeout: 30000 }, (err, stdout) => {
          if (err) return resolve(null);
          try {
            const duration = parseFloat(stdout.trim());
            resolve(isNaN(duration) ? null : duration);
          } catch {
            resolve(null);
          }
        });
      });
    } catch {
      return null;
    }
  }

  public async executeDownload(
    url: string,
    outputPath: string,
    onProgress: (percent: number, speed: string, eta: string, strategy: string) => void
  ): Promise<{ outputPath: string; attempts: DownloadAttempt[] }> {
    const safeUrl = await assertSafeRemoteVideoUrl(url);
    const bin = getBinaryPath('yt-dlp');
    const ffmpegBin = getBinaryPath('ffmpeg');
    
    console.log(`[DownloadEngine]: Probing duration for smart resolution capping...`);
    const duration = await this.probeDuration(safeUrl);

    const activeStrategies = this.strategyManager.getStrategiesForVideo(duration);
    const attempts: DownloadAttempt[] = [];

    return withYtDlpCookies(async (cookiePath) => {
      for (const [index, strategy] of activeStrategies.entries()) {
        let currentRetries = 0;
        let success = false;

        while (currentRetries <= strategy.maxRetries && !success) {
          const telemetry = new TelemetryCollector(strategy.id, strategy.extractorArgs);
          await telemetry.populateEnvironment();
          
          const startTime = Date.now();
          try {
            console.log(`[DownloadEngine]: Attempting Strategy ${index + 1}/${activeStrategies.length} (${strategy.id}) - Retry ${currentRetries}/${strategy.maxRetries}`);
            
            const { outputPath: finalOutputPath, command, finalSpeedBps } = await this.runStrategy(
              strategy,
              bin,
              ffmpegBin,
              safeUrl,
              outputPath,
              cookiePath,
              (percent, speed, eta) => onProgress(percent, speed, eta, strategy.id)
            );
            
            telemetry.setCommand(this.redactSecrets(command));
            telemetry.recordSuccess(Date.now() - startTime, finalSpeedBps ? finalSpeedBps / (1024 * 1024) : undefined);
            attempts.push(telemetry.build());
            
            this.strategyManager.recordResult(strategy.id, true);
            console.log(`[DownloadEngine]: Success with ${strategy.id}`);
            return { outputPath: finalOutputPath, attempts };
            
          } catch (error: any) {
            const errMsg = error.message || String(error);
            telemetry.setCommand(this.redactSecrets(error.command || []));
            telemetry.recordFailure(Date.now() - startTime, errMsg);
            attempts.push(telemetry.build());
            
            console.error(`[DownloadEngine]: Strategy ${strategy.id} failed: ${errMsg.substring(0, 100)}...`);
            this.cleanupPartialFiles(outputPath);
            
            currentRetries++;
          }
        }
        
        this.strategyManager.recordResult(strategy.id, false);
      }

      const e = new Error(`All download strategies failed.`);
      (e as any).attempts = attempts;
      throw e;
    });
  }

  private redactSecrets(command: string[]): string[] {
    return command.map(arg => {
      if (arg.includes('cookies.txt')) return '[REDACTED_COOKIES_PATH]';
      if (arg.includes('http://') || arg.includes('https://') && arg.includes('@')) {
        // Redact basic auth in proxy URLs
        return arg.replace(/\/\/[^:]+:[^@]+@/, '//[REDACTED_AUTH]@');
      }
      return arg;
    });
  }

  private cleanupPartialFiles(outputPath: string) {
    const dir = path.dirname(outputPath);
    try {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.startsWith('input') && (f.endsWith('.part') || f.endsWith('.ytdl'))) {
          fs.unlinkSync(path.join(dir, f));
        }
      }
    } catch (e) {
      console.warn(`[DownloadEngine]: Cleanup warning: ${(e as any).message}`);
    }
  }

  private runStrategy(
    strategy: DownloadStrategy,
    bin: string,
    ffmpegBin: string,
    url: string,
    outputPath: string,
    cookiePath: string | null,
    onProgress: (percent: number, speed: string, eta: string) => void
  ): Promise<{ outputPath: string; command: string[], finalSpeedBps?: number }> {
    return new Promise((resolve, reject) => {
      const args = [
        '-f', `bestvideo[height<=${strategy.resolutionCap}]+bestaudio/best[height<=${strategy.resolutionCap}]`,
        '--merge-output-format', 'mkv',
        '-o', outputPath,
        '--no-playlist',
        '--no-cache-dir',
      ];
      if (ffmpegBin !== 'ffmpeg' && ffmpegBin !== 'ffmpeg.exe') {
        args.push('--ffmpeg-location', ffmpegBin);
      }
      
      if (strategy.extractorArgs) {
        args.push('--extractor-args', strategy.extractorArgs);
      }
      if (strategy.userAgent) {
        args.push('--user-agent', strategy.userAgent);
      }

      args.push(
        '--geo-bypass',
        '--no-write-subs',
        '--no-embed-subs',
        '--no-write-auto-subs',
        '--retries', '1', // Handled by our StrategyManager now
        '--fragment-retries', '3',
        '--sleep-interval', '1',
        '--limit-rate', strategy.rateLimit || '10M',
        '--no-check-certificates',
        '--verbose',
        ...this.getYtDlpOptionalArgs(cookiePath, strategy),
        '--newline',
        '--progress',
        url
      );

      const command = [bin, ...args];
      let slowTimer: NodeJS.Timeout | null = null;
      let childProcess: ChildProcess | null = null;
      let isThrottled = false;
      let lastSpeedBps = -1;
      
      childProcess = spawn(bin, args);

      let stdoutStr = '';
      let stderrStr = '';
      
      childProcess.stdout?.on('data', (data) => {
        const msg = data.toString();
        if (stdoutStr.length < 50000) stdoutStr += msg;
        
        const lines = msg.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.includes('%')) continue;
          
          const percentMatch = trimmed.match(/(\d+(\.\d+)?)%/);
          const speedMatch = trimmed.match(/at\s+([\d.]+)(KiB|MiB|GiB|B)\/s/);
          const etaMatch = trimmed.match(/ETA\s+([\d:]+)/);

          let speedBps = -1;
          if (speedMatch) {
            const val = parseFloat(speedMatch[1]);
            const unit = speedMatch[2];
            if (unit === 'B') speedBps = val;
            else if (unit === 'KiB') speedBps = val * 1024;
            else if (unit === 'MiB') speedBps = val * 1024 * 1024;
            else if (unit === 'GiB') speedBps = val * 1024 * 1024 * 1024;
            lastSpeedBps = speedBps;
          }

          if (percentMatch && percentMatch[1]) {
            const percent = parseFloat(percentMatch[1]);
            const speedStr = speedMatch ? `${speedMatch[1]}${speedMatch[2]}/s` : 'unknown';
            const etaStr = etaMatch ? etaMatch[1] : 'unknown';
            onProgress(percent, speedStr, etaStr);
          }

          if (speedBps !== -1 && speedBps < this.THROTTLE_THRESHOLD_BPS) {
            if (!slowTimer) {
              slowTimer = setTimeout(() => {
                console.warn(`[DownloadEngine]: Download throttled (<100KiB/s) for 15s. Aborting strategy.`);
                isThrottled = true;
                if (childProcess && !childProcess.killed) {
                  childProcess.kill('SIGTERM');
                }
              }, this.THROTTLE_TIME_LIMIT_MS);
            }
          } else {
            if (slowTimer) {
              clearTimeout(slowTimer);
              slowTimer = null;
            }
          }
        }
      });

      childProcess.stderr?.on('data', (data) => {
        const msg = data.toString();
        if (stderrStr.length < 50000) stderrStr += msg;
      });

      const killTimeout = setTimeout(() => {
        if (childProcess && !childProcess.killed) {
          childProcess.kill('SIGKILL');
          reject(new Error('Process timed out after 30 minutes'));
        }
      }, 1000 * 60 * 30);

      childProcess.on('close', (code, signal) => {
        clearTimeout(killTimeout);
        if (slowTimer) clearTimeout(slowTimer);
        
        if (code !== 0 || isThrottled) {
          if (isThrottled || signal === 'SIGTERM') {
            const err = new Error('KILLED_THROTTLED: Download was too slow (< 100KiB/s)');
            (err as any).command = command;
            return reject(err);
          }
          if (fs.existsSync(outputPath)) {
            return resolve({ outputPath, command, finalSpeedBps: lastSpeedBps });
          }
          const rawMessage = [stderrStr, stdoutStr, `Exited with code ${code} signal ${signal}`].filter(Boolean).join('\n');
          const err = new Error(rawMessage);
          (err as any).command = command;
          return reject(err);
        }

        if (!fs.existsSync(outputPath)) {
          const dir = path.dirname(outputPath);
          const files = fs.readdirSync(dir);
          const matches = files
            .filter(f => f.startsWith('input') && (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv') || f.includes('.mp4') || f.includes('.mkv')))
            .map(f => ({ name: f, size: fs.statSync(path.join(dir, f)).size }))
            .sort((a, b) => b.size - a.size);

          if (matches.length > 0) {
            const matchPath = path.join(dir, matches[0].name);
            try {
              fs.renameSync(matchPath, outputPath);
              return resolve({ outputPath, command, finalSpeedBps: lastSpeedBps });
            } catch {
              return resolve({ outputPath: matchPath, command, finalSpeedBps: lastSpeedBps });
            }
          } else {
            const err = new Error(`File not found at ${outputPath}`);
            (err as any).command = command;
            return reject(err);
          }
        }

        resolve({ outputPath, command, finalSpeedBps: lastSpeedBps });
      });


    });
  }
}
