import { MediaStreamInfo, PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import { runWithTimeout } from '@excerpt/shared';
import { spawn } from 'child_process';
import { join } from 'path';

export class Prober {
  static async probe(filePath: string, timeoutMs: number = 30000): Promise<{ durationMs: number; videoStream?: MediaStreamInfo; audioStream?: MediaStreamInfo }> {
    const ffprobeArgs = [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=codec_name,codec_type,width,height,r_frame_rate,bit_rate',
      '-of', 'json',
      filePath
    ];

    const cp = spawn('ffprobe', ffprobeArgs);
    let stdout = '';
    let stderr = '';

    cp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    cp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const runPromise = new Promise<void>((resolve, reject) => {
      cp.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
      });
      cp.on('error', reject);
    });

    try {
      await runWithTimeout(runPromise, timeoutMs, { childProcess: cp });
    } catch (err: any) {
      throw new PipelineError(
        PipelineErrorCode.DownloadFailed, // Map to a generic failure if probe times out/fails
        `Probe failed: ${err.message}`
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch (e) {
      throw new PipelineError(PipelineErrorCode.DownloadFailed, `Invalid ffprobe output: ${stdout}`);
    }

    if (!parsed.format || parsed.format.duration === undefined) {
      throw new PipelineError(PipelineErrorCode.DownloadFailed, 'Could not determine duration from file');
    }

    const durationMs = Math.round(parseFloat(parsed.format.duration) * 1000);
    
    let videoStream: MediaStreamInfo | undefined;
    let audioStream: MediaStreamInfo | undefined;

    if (parsed.streams) {
      for (const stream of parsed.streams) {
        if (stream.codec_type === 'video' && !videoStream) {
          let fps: number | undefined;
          if (stream.r_frame_rate) {
            const [num, den] = stream.r_frame_rate.split('/');
            if (num && den && parseInt(den, 10) !== 0) {
              fps = parseInt(num, 10) / parseInt(den, 10);
            }
          }
          videoStream = {
            codec: stream.codec_name,
            width: stream.width,
            height: stream.height,
            fps: fps ? Math.round(fps * 100) / 100 : undefined,
            bitrate: stream.bit_rate ? parseInt(stream.bit_rate, 10) : undefined,
          };
        } else if (stream.codec_type === 'audio' && !audioStream) {
          audioStream = {
            codec: stream.codec_name,
            bitrate: stream.bit_rate ? parseInt(stream.bit_rate, 10) : undefined,
          };
        }
      }
    }

    return { durationMs, videoStream, audioStream };
  }
}
