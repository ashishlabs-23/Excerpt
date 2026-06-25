import { execFile } from 'child_process';
import { promisify } from 'util';
import { NexusSignal } from './NexusRegistry';
import { getBinaryPath } from '../videoProcessor';

const execFileAsync = promisify(execFile);

export class AudioIntelligence {
  /**
   * Analyzes audio levels using ffmpeg volumedetect.
   * Higher mean volume indicates more "active" segments.
   */
  public async getSignal(videoPath: string): Promise<NexusSignal> {
    try {
      if (process.env.EXCERPT_FORCE_AUDIO_FAIL === 'true') {
        throw new Error('Forced audio module failure');
      }

      const nullSink = process.platform === 'win32' ? 'NUL' : '/dev/null';
      // Use volumedetect filter to get audio statistics
      // We pipe to null because we only care about the stderr output
      const { stderr } = await execFileAsync(
        getBinaryPath('ffmpeg'),
        ['-i', videoPath, '-af', 'volumedetect', '-f', 'null', nullSink],
        {
          timeout: Number(process.env.EXCERPT_NEXUS_AUDIO_TIMEOUT_MS || 30000),
          maxBuffer: 1024 * 1024,
        }
      );

      const stderrText = stderr.toString();
      const meanVolumeMatch = stderrText.match(/mean_volume: ([\-\d\.]+) dB/);
      const maxVolumeMatch = stderrText.match(/max_volume: ([\-\d\.]+) dB/);

      if (!meanVolumeMatch) {
        return {
          score: 0.5,
          weight: 0.2,
          reason: 'Could not detect audio levels',
          status: 'skipped',
          fallback_used: true,
        };
      }

      const meanVolume = parseFloat(meanVolumeMatch[1]);
      const maxVolume = maxVolumeMatch ? parseFloat(maxVolumeMatch[1]) : -10;

      // Normalize: typically mean volume ranges from -30dB (quiet) to -10dB (loud)
      // We map -35dB -> 0.0 and -10dB -> 1.0
      let score = (meanVolume + 35) / 25;
      score = Math.max(0.1, Math.min(1.0, score));

      // Boost score if max volume is near 0dB (clipping/loud signals)
      if (maxVolume > -3) score = Math.min(1.0, score + 0.1);

      return {
        score,
        weight: 0.3,
        reason: `Mean: ${meanVolume}dB, Max: ${maxVolume}dB`,
        status: 'success',
        fallback_used: false,
      };
    } catch (e) {
      console.error('[Nexus] AudioIntelligence Error:', e);
      return {
        score: 0.5,
        weight: 0,
        reason: 'Audio analysis error',
        status: 'skipped',
        fallback_used: true,
      };
    }
  }
}
