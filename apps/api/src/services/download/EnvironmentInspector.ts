import { execFile } from 'child_process';
import os from 'os';
import { getBinaryPath } from '../videoProcessor';

export interface EnvironmentSnapshot {
  ytDlpVersion: string;
  ffmpegVersion: string;
  pythonVersion: string;
  nodeVersion: string;
  os: string;
  arch: string;
  cpu: string;
  memory: string;
  timezone: string;
}

export class EnvironmentInspector {
  private static cache: EnvironmentSnapshot | null = null;

  public static async getSnapshot(): Promise<EnvironmentSnapshot> {
    if (this.cache) return this.cache;

    const [ytDlpVersion, ffmpegVersion, pythonVersion] = await Promise.all([
      this.getCommandOutput(getBinaryPath('yt-dlp'), ['--version']),
      this.getCommandOutput(getBinaryPath('ffmpeg'), ['-version']).then(out => out.split('\n')[0] || 'unknown'),
      this.getCommandOutput('python3', ['--version']).catch(() => 
        this.getCommandOutput('python', ['--version'])
      ).catch(() => 'unknown')
    ]);

    this.cache = {
      ytDlpVersion,
      ffmpegVersion,
      pythonVersion: pythonVersion.trim(),
      nodeVersion: process.version,
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpu: os.cpus()[0]?.model || 'unknown',
      memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    return this.cache;
  }

  private static getCommandOutput(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve) => {
      execFile(bin, args, { timeout: 5000 }, (err, stdout) => {
        if (err) return resolve('unknown');
        resolve(stdout.trim());
      });
    });
  }
}
