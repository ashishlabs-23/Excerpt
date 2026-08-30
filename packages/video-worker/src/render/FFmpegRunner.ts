import { spawn } from 'child_process';
import { killOnTimeout } from '@excerpt/shared';
import { Logger } from '@excerpt/shared';
import { PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';

export class FFmpegRunner {
  constructor(private logger: Logger) {}

  /**
   * Executes a real FFmpeg child process, tightly bound by a SIGKILL timeout wrapper.
   */
  async runRender(inputPath: string, outputPath: string, startMs: number, endMs: number, timeoutMs: number): Promise<void> {
    const startSec = (startMs / 1000).toFixed(3);
    const durationSec = ((endMs - startMs) / 1000).toFixed(3);

    const videoCodec = process.env.FFMPEG_VIDEO_CODEC || 'libx264';
    const preset = process.env.FFMPEG_PRESET || 'fast';

    const args = [
      '-y', // Overwrite
      '-ss', startSec,
      '-i', inputPath,
      '-t', durationSec,
      '-c:v', videoCodec,
      '-preset', preset,
      '-c:a', 'aac',
      outputPath
    ];

    this.logger.info(`[FFmpegRunner] Spawning ffmpeg ${args.join(' ')}`);

    // We must pass the spawn option `detached: true` on unix to allow process group killing
    const isWin = process.platform === 'win32';
    const ffmpegProcess = spawn('ffmpeg', args, {
      detached: !isWin, // Detach on unix to form a new process group for -PID killing
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderrLog = '';
    ffmpegProcess.stderr?.on('data', (data) => {
      stderrLog += data.toString();
    });

    try {
      // Await the process, wrapped in the SIGKILL-enforcing timeout
      await killOnTimeout(ffmpegProcess, timeoutMs, this.logger);
      this.logger.info(`[FFmpegRunner] Render completed successfully: ${outputPath}`);
    } catch (e: any) {
      this.logger.error(`[FFmpegRunner] Render failed: ${e.message}. Stderr: ${stderrLog.slice(-500)}`);
      throw new PipelineError(PipelineErrorCode.RenderFailed, `Render failed: ${e.message}`);
    }
  }

  async executeWithTimeout(
    cmdOrInput: string,
    argsOrOutput: string | string[],
    outPathOrStart: string | number,
    timeoutOrEnd: number,
    timeoutMs?: number
  ): Promise<void> {
    if (typeof timeoutMs === 'number') {
      return this.runRender(cmdOrInput, argsOrOutput as string, outPathOrStart as number, timeoutOrEnd, timeoutMs);
    }

    // 4-arg invocation: (cmd, args, outputPath, timeout)
    const cmd = cmdOrInput;
    const args = Array.isArray(argsOrOutput) ? argsOrOutput : [argsOrOutput];
    const timeout = timeoutOrEnd;

    const isWin = process.platform === 'win32';
    const proc = spawn(cmd, args, {
      detached: !isWin,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
      await killOnTimeout(proc, timeout, this.logger);
    } catch (e: any) {
      throw new PipelineError(PipelineErrorCode.RenderFailed, `Render execution timed out: ${e.message}`);
    }
  }
}
