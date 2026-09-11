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
   * Snaps speech boundary timestamps to the nearest visual scene cut if within maxDeltaSec.
   * If words are provided, guarantees zero speech truncation by only snapping startSec
   * before or at the first spoken word, and endSec after or at the last spoken word.
   */
  public snapBoundariesToSceneCut(
    startSec: number,
    endSec: number,
    sceneCuts: SceneCutPoint[],
    maxDeltaSec = 0.45,
    options?: { words?: Array<{ start: number; end: number }> }
  ): { snappedStartSec: number; snappedEndSec: number; startSnapped: boolean; endSnapped: boolean } {
    let snappedStartSec = startSec;
    let snappedEndSec = endSec;
    let startSnapped = false;
    let endSnapped = false;

    const firstWord = options?.words?.find((w) => w.end > startSec);
    const lastWord = options?.words ? [...options.words].reverse().find((w) => w.start < endSec) : undefined;

    let bestStartDelta = Infinity;
    let bestEndDelta = Infinity;

    for (const cut of sceneCuts) {
      // Check start cut: must not cut into speech of first word and must be closest
      const deltaStart = Math.abs(cut.timestampSec - startSec);
      if (deltaStart <= maxDeltaSec && deltaStart < bestStartDelta) {
        const wouldTruncateStart = firstWord && cut.timestampSec > firstWord.start;
        if (!wouldTruncateStart) {
          snappedStartSec = cut.timestampSec;
          bestStartDelta = deltaStart;
          startSnapped = true;
        }
      }

      // Check end cut: must not cut off last spoken word and must be closest
      const deltaEnd = Math.abs(cut.timestampSec - endSec);
      if (deltaEnd <= maxDeltaSec && deltaEnd < bestEndDelta) {
        const wouldTruncateEnd = lastWord && cut.timestampSec < lastWord.end;
        if (!wouldTruncateEnd) {
          snappedEndSec = cut.timestampSec;
          bestEndDelta = deltaEnd;
          endSnapped = true;
        }
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
