import { execFile } from 'child_process';
import { promisify } from 'util';
import { getBinaryPath } from '../videoProcessor';
import { CrowdScore, PipelineContext } from './PipelineContext';
import { isMultiModalEnabled } from '../../config/features';

const execFileAsync = promisify(execFile);

export class CrowdExcitementEngine {
  /**
   * Generates a time-series of crowd excitement scores for a video.
   */
  public async generateTimeline(videoPath: string, context: PipelineContext): Promise<CrowdScore[]> {
    const start = Date.now();

    if (!isMultiModalEnabled('crowd_engine')) {
      console.log(`[CrowdExcitementEngine]: Crowd Excitement Engine disabled via feature flag.`);
      context.executionTimes['CrowdExcitementEngine'] = Date.now() - start;
      return [];
    }

    console.log(`[CrowdExcitementEngine]: Running FFmpeg astats analysis on '${videoPath}'...`);

    try {
      const nullSink = process.platform === 'win32' ? 'NUL' : '/dev/null';
      const { stderr } = await execFileAsync(
        getBinaryPath('ffmpeg'),
        [
          '-i', videoPath,
          '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level',
          '-f', 'null', nullSink
        ],
        { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
      );

      const timeline = this.parseAstats(stderr);
      context.crowdTimeline = timeline;

      const duration = Date.now() - start;
      context.executionTimes['CrowdExcitementEngine'] = duration;
      console.log(`[CrowdExcitementEngine]: Completed. Generated ${timeline.length} data points in ${duration}ms.`);

      return timeline;
    } catch (err: any) {
      console.error(`[CrowdExcitementEngine]: FFmpeg execution failed:`, err);
      context.executionTimes['CrowdExcitementEngine'] = Date.now() - start;
      return [];
    }
  }

  /**
   * Parses the output of FFmpeg astats + ametadata filter.
   */
  private parseAstats(stderr: string): CrowdScore[] {
    const lines = stderr.split(/\r?\n/);
    const rawPoints: { timestamp: number; db: number }[] = [];

    let currentT: number | null = null;

    for (const line of lines) {
      // Find timestamp line: e.g. "frame:142  pts:204480 t:4.636735"
      const tMatch = line.match(/t:([\d.]+)/);
      if (tMatch) {
        currentT = parseFloat(tMatch[1]);
        continue;
      }

      // Find value line: e.g. "lavfi.astats.Overall.RMS_level=-34.200922"
      if (currentT !== null) {
        const valMatch = line.match(/lavfi\.astats\.Overall\.RMS_level=([\-\d.]+)/);
        if (valMatch) {
          const db = parseFloat(valMatch[1]);
          // Filter out invalid/silence values
          if (!isNaN(db) && isFinite(db) && db > -100) {
            rawPoints.push({ timestamp: currentT, db });
          }
          currentT = null;
        }
      }
    }

    if (rawPoints.length === 0) {
      return [];
    }

    // 1. Group/average into 1-second bins
    const bins: Map<number, number[]> = new Map();
    for (const pt of rawPoints) {
      const second = Math.floor(pt.timestamp);
      if (!bins.has(second)) {
        bins.set(second, []);
      }
      bins.get(second)!.push(pt.db);
    }

    const binnedPoints: { timestamp: number; linear: number }[] = [];
    const sortedSeconds = Array.from(bins.keys()).sort((a, b) => a - b);

    for (const sec of sortedSeconds) {
      const dbValues = bins.get(sec)!;
      const avgDb = dbValues.reduce((sum, v) => sum + v, 0) / dbValues.length;
      // Convert to linear amplitude
      const linear = Math.pow(10, avgDb / 20);
      binnedPoints.push({ timestamp: sec, linear });
    }

    // 2. Compute rolling 30-second average and final scores
    const timeline: CrowdScore[] = [];
    const windowSize = 30; // 30 seconds rolling average

    for (let i = 0; i < binnedPoints.length; i++) {
      const current = binnedPoints[i];
      
      // Get rolling window
      const startIdx = Math.max(0, i - windowSize + 1);
      const window = binnedPoints.slice(startIdx, i + 1);
      const avgLinear = window.reduce((sum, pt) => sum + pt.linear, 0) / window.length;

      // Avoid divide-by-zero or extremely low baseline noise issues
      const baseline = Math.max(avgLinear, 0.0001);
      const ratio = current.linear / baseline;
      
      // Score ranges 0 - 100 based on standard ratio scale (e.g. 1.0x = 50, 1.5x = 75, 2.0x = 100)
      const score = Math.min(100, Math.max(0, Math.round(ratio * 50)));

      let label: 'calm' | 'excited' | 'eruption' = 'calm';
      if (score >= 75) { // corresponds to ratio >= 1.5x
        label = 'eruption';
      } else if (score >= 60) { // corresponds to ratio >= 1.2x
        label = 'excited';
      }

      timeline.push({
        timestamp: current.timestamp,
        score,
        label
      });
    }

    return timeline;
  }
}
