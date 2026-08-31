import { execFile } from 'child_process';
import { getBinaryPath } from '../videoProcessor';

export interface SceneCutPoint {
  timestampSec: number;
  score: number;
}

export class SceneCutSnapper {
  /**
   * Detects visual shot transitions within a time window in the source video
   */
  public async detectSceneCuts(
    videoPath: string,
    windowStartSec: number,
    windowDurationSec: number,
    sceneThreshold = 0.3
  ): Promise<SceneCutPoint[]> {
    const ffmpeg = getBinaryPath('ffmpeg');
    const args = [
      '-ss', String(Math.max(0, windowStartSec)),
      '-i', videoPath,
      '-t', String(windowDurationSec),
      '-vf', `select='gt(scene,${sceneThreshold})',metadata=print:file=-`,
      '-f', 'null',
      '-',
    ];

    return new Promise((resolve) => {
      execFile(ffmpeg, args, { maxBuffer: 1024 * 1024 * 20 }, (_err, stdout, stderr) => {
        const output = [stdout, stderr].join('\n');
        const cuts: SceneCutPoint[] = [];

        // Match pts_time values or scene_score in metadata output
        const regex = /pts_time:([0-9.]+)/g;
        let match;
        while ((match = regex.exec(output)) !== null) {
          const relativeTime = parseFloat(match[1]);
          if (!isNaN(relativeTime)) {
            cuts.push({
              timestampSec: Number((windowStartSec + relativeTime).toFixed(3)),
              score: 0.8,
            });
          }
        }

        resolve(cuts);
      });
    });
  }

  /**
   * Snaps speech boundary timestamps to the nearest visual scene cut if within maxDeltaSec
   */
  public snapBoundariesToSceneCut(
    startSec: number,
    endSec: number,
    sceneCuts: SceneCutPoint[],
    maxDeltaSec = 0.45
  ): { snappedStartSec: number; snappedEndSec: number; startSnapped: boolean; endSnapped: boolean } {
    let snappedStartSec = startSec;
    let snappedEndSec = endSec;
    let startSnapped = false;
    let endSnapped = false;

    for (const cut of sceneCuts) {
      // Check start cut
      const deltaStart = Math.abs(cut.timestampSec - startSec);
      if (deltaStart <= maxDeltaSec) {
        snappedStartSec = cut.timestampSec;
        startSnapped = true;
      }

      // Check end cut
      const deltaEnd = Math.abs(cut.timestampSec - endSec);
      if (deltaEnd <= maxDeltaSec) {
        snappedEndSec = cut.timestampSec;
        endSnapped = true;
      }
    }

    return {
      snappedStartSec: Number(snappedStartSec.toFixed(3)),
      snappedEndSec: Number(snappedEndSec.toFixed(3)),
      startSnapped,
      endSnapped,
    };
  }
}
