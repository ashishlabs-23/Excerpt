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
  public async getSignal(videoPath: string): Promise<NexusSignal> {
    try {
      if (process.env.EXCERPT_FORCE_VISUAL_FAIL === 'true') {
        throw new Error('Forced visual module failure');
      }

      // Normalize path for FFmpeg movie filter
      // FFmpeg's movie filter on Windows is notoriously picky about backslashes and colons.
      // We convert all \ to / and then escape the : after the drive letter.
      const normalizedPath = videoPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      
      const { stdout } = await execFileAsync(
        getBinaryPath('ffprobe'),
        [
          '-v', 'error',
          '-show_entries', 'frame=pkt_pts_time',
          '-of', 'csv=p=0',
          '-f', 'lavfi',
          `movie='${normalizedPath}',select='gt(scene,0.2)'`,
        ],
        {
          timeout: Number(process.env.EXCERPT_NEXUS_VISUAL_TIMEOUT_MS || 30000),
          maxBuffer: 1024 * 1024,
        }
      );

      // stdout is a list of timestamps where a scene change happened
      const timestamps = stdout.toString().trim().split('\n').filter(t => t.length > 0);
      const sceneChangeCount = timestamps.length;

      // We normalize based on the duration. 
      // Typical high-quality video has 5-10 scene changes per 30 seconds.
      // We map 0 changes -> 0.2 score, 10+ changes -> 1.0
      let score = 0.2 + (sceneChangeCount / 10) * 0.8;
      score = Math.min(1.0, score);

      return {
        score,
        weight: 0.3,
        reason: `Detected ${sceneChangeCount} scene changes`,
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
