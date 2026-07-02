import { execFile, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { assertSafeRemoteVideoUrl } from './urlSafety';
import { withYtDlpCookies } from '../lib/cookieHelper';
import { getBinaryPath } from './videoProcessor'; 

export interface DownloadStrategy {
  id: string;
  resolutionCap: string; 
  extractorArgs?: string; 
  useCookies: boolean;
  userAgent?: string;
  rateLimit?: string;
}

const DEFAULT_STRATEGIES: DownloadStrategy[] = [
  {
    id: 'strategy_1_1080p_ios',
    resolutionCap: '1080',
    extractorArgs: 'youtube:player_client=ios',
    useCookies: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    rateLimit: '25M'
  },
  {
    id: 'strategy_2_1080p_mweb',
    resolutionCap: '1080',
    extractorArgs: 'youtube:player_client=mweb',
    useCookies: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36',
    rateLimit: '25M'
  },
  {
    id: 'strategy_3_720p_tv_web',
    resolutionCap: '720',
    extractorArgs: 'youtube:player_client=tv,web',
    useCookies: true,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    rateLimit: '15M'
  },
  {
    id: 'strategy_4_720p_android',
    resolutionCap: '720',
    extractorArgs: 'youtube:player_client=android',
    useCookies: false, 
    userAgent: 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
    rateLimit: '10M'
  },
  {
    id: 'strategy_5_720p_ios_no_cookie',
    resolutionCap: '720',
    extractorArgs: 'youtube:player_client=ios',
    useCookies: false,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    rateLimit: '10M'
  },
  {
    id: 'strategy_6_720p_default',
    resolutionCap: '720',
    useCookies: false,
    rateLimit: '10M'
  }
];

export class DownloadIntelligenceEngine {
  private strategies = DEFAULT_STRATEGIES;
  
  // Define slow download as under 100KiB/s (100 * 1024 bytes)
  private readonly THROTTLE_THRESHOLD_BPS = 100 * 1024;
  private readonly THROTTLE_TIME_LIMIT_MS = 15000; // Must be slow for 15 seconds to abort

  private getYtDlpOptionalArgs(cookiesPath: string | null, strategy: DownloadStrategy): string[] {
    const args: string[] = [];
    if (strategy.useCookies && cookiesPath) {
      args.push('--cookies', cookiesPath);
    }
    // Could support proxy rotation here from process.env.YTDLP_PROXY if needed
    return args;
  }

  /**
   * Probes the video for duration and automatically adjusts maximum resolution.
   */
  public async probeDuration(url: string): Promise<number | null> {
    try {
      const bin = getBinaryPath('yt-dlp');
      return await new Promise((resolve) => {
        execFile(bin, ['--dump-json', url], { timeout: 30000 }, (err, stdout) => {
          if (err) return resolve(null);
          try {
            const data = JSON.parse(stdout);
            resolve(data.duration || null);
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
  ): Promise<string> {
    const safeUrl = await assertSafeRemoteVideoUrl(url);
    const bin = getBinaryPath('yt-dlp');
    const ffmpegBin = getBinaryPath('ffmpeg');
    
    console.log(`[DownloadEngine]: Probing duration for smart resolution capping...`);
    const duration = await this.probeDuration(safeUrl);
    console.log(`[DownloadEngine]: Video duration: ${duration || 'unknown'} seconds`);

    // Override resolutions based on length to save storage
    let localStrategies = [...this.strategies];
    if (duration && duration > 3600) {
      console.log(`[DownloadEngine]: Video > 1hr detected. Capping all strategies to 720p.`);
      localStrategies = localStrategies.map(s => ({ ...s, resolutionCap: '720' }));
    }

    const errors: string[] = [];

    return withYtDlpCookies(async (cookiePath) => {
      for (const [index, strategy] of localStrategies.entries()) {
        try {
          console.log(`[DownloadEngine]: Attempting Strategy ${index + 1}/${localStrategies.length} (${strategy.id})`);
          
          const result = await this.runStrategy(
            strategy,
            bin,
            ffmpegBin,
            safeUrl,
            outputPath,
            cookiePath,
            (percent, speed, eta) => onProgress(percent, speed, eta, strategy.id)
          );
          
          console.log(`[DownloadEngine]: Success with ${strategy.id}`);
          return result;
          
        } catch (error: any) {
          console.error(`[DownloadEngine]: Strategy ${strategy.id} failed: ${error.message}`);
          errors.push(`[${strategy.id}]: ${error.message}`);
          this.cleanupPartialFiles(outputPath);
        }
      }

      throw new Error(`All download strategies failed:\n${errors.join('\n')}`);
    });
  }

  private cleanupPartialFiles(outputPath: string) {
    const dir = path.dirname(outputPath);
    try {
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
  ): Promise<string> {
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
        '--retries', '3', // Reduce retries so it falls back to next strategy faster
        '--retry-sleep', '2',
        '--fragment-retries', '5',
        '--sleep-interval', '1',
        '--max-sleep-interval', '2',
        '--limit-rate', strategy.rateLimit || '10M',
        '--no-check-certificates',
        '--verbose',
        ...this.getYtDlpOptionalArgs(cookiePath, strategy),
        '--newline',
        '--progress',
        url
      );

      let slowTimer: NodeJS.Timeout | null = null;
      let childProcess: ChildProcess | null = null;
      let isThrottled = false;
      
      childProcess = execFile(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 30 }, (error, stdout, stderr) => {
        if (slowTimer) clearTimeout(slowTimer);
        
        if (error || isThrottled) {
          if (isThrottled || error?.signal === 'SIGTERM' || (error?.message && error.message.includes('KILLED_THROTTLED'))) {
            return reject(new Error('KILLED_THROTTLED: Download was too slow (< 100KiB/s)'));
          }
          if (fs.existsSync(outputPath)) {
            return resolve(outputPath); // Partial success edgecase
          }
          const rawMessage = [stderr, stdout, error?.message].filter(Boolean).join('\n');
          return reject(new Error(rawMessage));
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
              return resolve(outputPath);
            } catch {
              return resolve(matchPath);
            }
          } else {
            return reject(new Error(`File not found at ${outputPath}`));
          }
        }

        resolve(outputPath);
      });

      // Track throttling 
      childProcess.stdout?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg.includes('%')) {
          // Parse: [download]  10.0% of 1.82GiB at 10.00MiB/s ETA 01:20
          const percentMatch = msg.match(/(\d+(\.\d+)?)%/);
          const speedMatch = msg.match(/at\s+([\d.]+)(KiB|MiB|GiB|B)\/s/);
          const etaMatch = msg.match(/ETA\s+([\d:]+)/);

          let speedBps = -1;
          if (speedMatch) {
            const val = parseFloat(speedMatch[1]);
            const unit = speedMatch[2];
            if (unit === 'B') speedBps = val;
            else if (unit === 'KiB') speedBps = val * 1024;
            else if (unit === 'MiB') speedBps = val * 1024 * 1024;
            else if (unit === 'GiB') speedBps = val * 1024 * 1024 * 1024;
          }

          if (percentMatch && percentMatch[1]) {
            const percent = parseFloat(percentMatch[1]);
            const speedStr = speedMatch ? `${speedMatch[1]}${speedMatch[2]}/s` : 'unknown';
            const etaStr = etaMatch ? etaMatch[1] : 'unknown';
            onProgress(percent, speedStr, etaStr);
          }

          // Throttle Check
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
    });
  }
}

export const downloadEngine = new DownloadIntelligenceEngine();
