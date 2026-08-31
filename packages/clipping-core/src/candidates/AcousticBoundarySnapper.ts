export interface WordTimestamp {
  word: string;
  start: number; // in seconds
  end: number;   // in seconds
  confidence?: number;
}

export interface AudioSilenceInterval {
  start: number; // in seconds
  end: number;   // in seconds
  duration: number;
}

export interface SnappedBoundaryResult {
  startSec: number;
  endSec: number;
  durationSec: number;
  startSnappedTo: 'word_start' | 'silence' | 'raw';
  endSnappedTo: 'word_end' | 'silence' | 'raw';
  startPreRollAppliedMs: number;
  endPostRollAppliedMs: number;
  truncatedWordAvoided: boolean;
}

export class AcousticBoundarySnapper {
  /**
   * Snaps raw clip start and end timestamps to natural speech and acoustic boundaries.
   * 
   * Principles:
   * 1. Never cut mid-word (Zero-Truncation Guard).
   * 2. Start snap: Include ~150-200ms pre-speech breath/attack padding.
   * 3. End snap: Search for the nearest acoustic silence or terminal word boundary within a search window.
   */
  static snap(
    rawStartSec: number,
    rawEndSec: number,
    words: WordTimestamp[],
    silences: AudioSilenceInterval[] = [],
    options: {
      minDurationSec?: number;
      maxDurationSec?: number;
      preRollMs?: number;
      postRollMs?: number;
      searchWindowSec?: number;
    } = {}
  ): SnappedBoundaryResult {
    const minDur = options.minDurationSec ?? 15.0;
    const maxDur = options.maxDurationSec ?? 60.0;
    const preRollSec = (options.preRollMs ?? 180) / 1000.0;
    const postRollSec = (options.postRollMs ?? 300) / 1000.0;
    const searchWindowSec = options.searchWindowSec ?? 1.5;

    let finalStart = rawStartSec;
    let finalEnd = rawEndSec;
    let startSnappedTo: SnappedBoundaryResult['startSnappedTo'] = 'raw';
    let endSnappedTo: SnappedBoundaryResult['endSnappedTo'] = 'raw';
    let truncatedWordAvoided = false;

    if (words.length > 0) {
      // 1. START BOUNDARY SNAPPING
      // Check if rawStart cuts inside an active word
      const intersectingStartWord = words.find(
        (w) => rawStartSec > w.start && rawStartSec < w.end
      );

      if (intersectingStartWord) {
        // Cut is inside a word -> Shift start to beginning of this word minus pre-roll
        finalStart = Math.max(0, intersectingStartWord.start - preRollSec);
        startSnappedTo = 'word_start';
        truncatedWordAvoided = true;
      } else {
        // Find the nearest word starting within search window of rawStart
        const candidateStartWords = words.filter(
          (w) => Math.abs(w.start - rawStartSec) <= searchWindowSec
        );

        if (candidateStartWords.length > 0) {
          const closestWord = candidateStartWords.reduce((prev, curr) =>
            Math.abs(curr.start - rawStartSec) < Math.abs(prev.start - rawStartSec) ? curr : prev
          );
          finalStart = Math.max(0, closestWord.start - preRollSec);
          startSnappedTo = 'word_start';
        }
      }

      // Check if there is an audio silence right before finalStart
      const precedingSilence = silences.find(
        (s) => s.end <= finalStart + preRollSec && s.end >= finalStart - 0.5
      );
      if (precedingSilence) {
        finalStart = Math.max(0, precedingSilence.end - 0.05);
        startSnappedTo = 'silence';
      }

      // 2. END BOUNDARY SNAPPING
      // Check if rawEnd cuts inside an active word
      const intersectingEndWord = words.find(
        (w) => rawEndSec > w.start && rawEndSec < w.end
      );

      if (intersectingEndWord) {
        // Cut is inside a word -> Shift end to complete this word plus post-roll
        finalEnd = intersectingEndWord.end + postRollSec;
        endSnappedTo = 'word_end';
        truncatedWordAvoided = true;
      } else {
        // Find candidate words ending near rawEnd
        const candidateEndWords = words.filter(
          (w) => Math.abs(w.end - rawEndSec) <= searchWindowSec
        );

        if (candidateEndWords.length > 0) {
          const closestWord = candidateEndWords.reduce((prev, curr) =>
            Math.abs(curr.end - rawEndSec) < Math.abs(prev.end - rawEndSec) ? curr : prev
          );
          finalEnd = closestWord.end + postRollSec;
          endSnappedTo = 'word_end';
        }
      }

      // Check if there is an acoustic silence right after the candidate end
      const succeedingSilence = silences.find(
        (s) => s.start >= finalEnd - postRollSec && s.start <= finalEnd + 0.8
      );
      if (succeedingSilence) {
        finalEnd = succeedingSilence.start + 0.1;
        endSnappedTo = 'silence';
      }
    }

    // 3. DURATION INTEGRITY CLAMPING
    const computedDuration = finalEnd - finalStart;
    if (computedDuration < minDur) {
      finalEnd = finalStart + minDur;
    } else if (computedDuration > maxDur) {
      finalEnd = finalStart + maxDur;
    }

    return {
      startSec: Number(finalStart.toFixed(3)),
      endSec: Number(finalEnd.toFixed(3)),
      durationSec: Number((finalEnd - finalStart).toFixed(3)),
      startSnappedTo,
      endSnappedTo,
      startPreRollAppliedMs: Math.round(preRollSec * 1000),
      endPostRollAppliedMs: Math.round(postRollSec * 1000),
      truncatedWordAvoided,
    };
  }
}
