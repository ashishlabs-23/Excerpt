import { execFile } from 'child_process';
import { promisify } from 'util';
import { NexusSignal } from './NexusRegistry';
import { getBinaryPath } from '../videoProcessor';

const execFileAsync = promisify(execFile);

export class VisualActivity {
  /**
   * Analyzes visual activity using FFmpeg's scndetect (Scene Change Detection).
   * High density of scene changes often translates to more "edited" and "compelling" content.
   */
  public async getSignal(videoPath: string, startTime?: number, duration?: number): Promise<NexusSignal> {
    try {
      if (process.env.EXCERPT_FORCE_VISUAL_FAIL === 'true') {
        throw new Error('Forced visual module failure');
      }

      const args: string[] = ['-v', 'error'];
      if (typeof startTime === 'number' && Number.isFinite(startTime) && startTime >= 0) {
        args.push('-ss', startTime.toFixed(3));
      }
      if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
        args.push('-t', duration.toFixed(3));
      }
      args.push(
        '-i', videoPath,
        '-filter:v', "select='gt(scene,0.2)',metadata=print:file=-",
        '-f', 'null',
        '-'
      );

      const { stdout } = await execFileAsync(
        getBinaryPath('ffmpeg'),
        args,
        {
          timeout: Number(process.env.EXCERPT_NEXUS_VISUAL_TIMEOUT_MS || 30000),
          maxBuffer: 1024 * 1024,
        }
      );

      const sceneMatches = stdout.toString().match(/lavfi\.scene_score=/g);
      const sceneChangeCount = sceneMatches ? sceneMatches.length : 0;

      // Normalize based on the duration (standardized to 30s benchmark window)
      const effectiveDuration = (typeof duration === 'number' && duration > 0) ? duration : 30;
      const changesPer30s = (sceneChangeCount / effectiveDuration) * 30;

      // 0 changes -> 0.2 score, 10+ changes per 30s -> 1.0
      let score = 0.2 + (changesPer30s / 10) * 0.8;
      score = Math.max(0.1, Math.min(1.0, score));

      return {
        score: Number(score.toFixed(3)),
        weight: 0.3,
        reason: `Detected ${sceneChangeCount} scene changes (${changesPer30s.toFixed(1)}/30s)`,
        status: 'success',
        fallback_used: false,
      };
    } catch (e) {
      console.error('[Nexus] VisualActivity Error:', e);
      return {
        score: 0.5,
        weight: 0,
        reason: 'Visual analysis error',
        status: 'skipped',
        fallback_used: true,
      };
    }
  }
}
