import { PerceptionSnapshot } from '@excerpt/clipping-core';

export interface BRollSegment {
  start: number;
  end: number;
  /** 0-1, based on how many signals agreed */
  confidence: number;
}

/**
 * BRollDetector - detects non-speaker / cutaway segments inside a
 * clip time range using only signals already present in PerceptionSnapshot.
 *
 * No new API calls. No GPU. Runs in < 5 ms per clip.
 *
 * Detection logic (sliding 0.5 s window, majority vote >= 2/4 signals):
 *   1. No transcript words in window        -> +1
 *   2. No speaker track in window           -> +1
 *   3. Audio energy < ENERGY_THRESHOLD      -> +1
 *   4. Scene cut starts within +/-0.3 s     -> +1
 *
 * Adjacent candidate windows are merged when the gap between them is
 * < MERGE_GAP_SEC, and segments shorter than MIN_DURATION_SEC are dropped.
 */
export class BRollDetector {
  private static readonly WINDOW_SEC = 0.5;
  private static readonly ENERGY_THRESHOLD = 0.15;
  private static readonly SCENE_CUT_PROXIMITY_SEC = 0.3;
  private static readonly MERGE_GAP_SEC = 0.3;
  private static readonly MIN_DURATION_SEC = 1.5;
  private static readonly SIGNAL_THRESHOLD = 2;

  /**
   * Detect B-roll segments within [clipStart, clipEnd) of the given snapshot.
   */
  public detect(
    snapshot: PerceptionSnapshot,
    clipStart: number,
    clipEnd: number,
  ): BRollSegment[] {
    const duration = clipEnd - clipStart;
    if (duration <= 0) return [];

    const words = snapshot.transcript.words || [];
    const speakers = snapshot.speakers.tracks || [];
    const audioEnergy = snapshot.audio.energySummary || [];
    const sampleInterval = snapshot.audio.sampleIntervalSec || 1.0;
    const sceneStarts = new Set(
      (snapshot.scenes.events || []).map((e: any) => Math.round(e.startSec * 10)),
    );

    const candidates: Array<{ start: number; end: number; score: number }> = [];

    for (
      let t = clipStart;
      t < clipEnd - BRollDetector.WINDOW_SEC + 0.001;
      t += BRollDetector.WINDOW_SEC
    ) {
      const wStart = t;
      const wEnd = t + BRollDetector.WINDOW_SEC;
      let score = 0;

      // Signal 1: no transcript words
      const hasWords = words.some((w: any) => w.end > wStart && w.start < wEnd);
      if (!hasWords) score++;

      // Signal 2: no speaker track
      const hasSpeaker = speakers.some((s: any) => s.endSec > wStart && s.startSec < wEnd);
      if (!hasSpeaker) score++;

      // Signal 3: audio energy below threshold
      const energyIdx = Math.floor(t / sampleInterval);
      const energy = audioEnergy[energyIdx] ?? 0;
      if (energy < BRollDetector.ENERGY_THRESHOLD) score++;

      // Signal 4: scene cut nearby
      const tKey = Math.round(t * 10);
      const nearCut = Array.from(sceneStarts).some(
        (ts: any) => Math.abs((ts as number) - tKey) <= Math.round(BRollDetector.SCENE_CUT_PROXIMITY_SEC * 10),
      );
      if (nearCut) score++;

      if (score >= BRollDetector.SIGNAL_THRESHOLD) {
        candidates.push({ start: wStart, end: wEnd, score });
      }
    }

    if (candidates.length === 0) return [];

    // Merge adjacent / overlapping candidate windows
    const merged: Array<{ start: number; end: number; totalScore: number; count: number }> = [];
    for (const c of candidates) {
      const last = merged[merged.length - 1];
      if (last && c.start - last.end <= BRollDetector.MERGE_GAP_SEC) {
        last.end = Math.max(last.end, c.end);
        last.totalScore += c.score;
        last.count++;
      } else {
        merged.push({ start: c.start, end: c.end, totalScore: c.score, count: 1 });
      }
    }

    // Filter short segments, clamp to clip boundaries, compute confidence
    return merged
      .filter(s => s.end - s.start >= BRollDetector.MIN_DURATION_SEC)
      .map(s => ({
        start: Number(Math.max(clipStart, s.start).toFixed(3)),
        end: Number(Math.min(clipEnd, s.end).toFixed(3)),
        confidence: Number(
          Math.min(1, (s.totalScore / s.count) / 4).toFixed(3),
        ),
      }));
  }
}

export const bRollDetector = new BRollDetector();
