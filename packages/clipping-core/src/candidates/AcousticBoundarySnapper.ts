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
  safeUpperBoundSec?: number;
  safeLowerBoundSec?: number;
}

export class AcousticBoundarySnapper {
  /**
   * Calculates the feasible start interval [startLowerBound, startUpperBound].
   * Prevents pulling in residue from preceding speech while allowing natural breath room.
   */
  public static calculateFeasibleStartInterval(
    targetWord: WordTimestamp,
    allWords: WordTimestamp[],
    options: {
      precedingSafetyMarginSec?: number;
      attackProtectionSec?: number;
      preRollSec?: number;
    } = {}
  ): { lowerBound: number; upperBound: number; isFeasible: boolean } {
    const safetyMargin = options.precedingSafetyMarginSec ?? 0.08;
    const attackProtection = options.attackProtectionSec ?? 0.02;

    // Find preceding speech word
    const targetIdx = allWords.indexOf(targetWord);
    let precedingWord: WordTimestamp | undefined = targetIdx > 0 ? allWords[targetIdx - 1] : undefined;
    if (!precedingWord) {
      for (let i = allWords.length - 1; i >= 0; i--) {
        if (allWords[i].start < targetWord.start && allWords[i] !== targetWord) {
          precedingWord = allWords[i];
          break;
        }
      }
    }

    const lowerBound = precedingWord ? precedingWord.end + safetyMargin : 0;
    const upperBound = Math.max(0, targetWord.start - attackProtection);

    // If timestamps overlap or noise inverted bounds:
    const isFeasible = lowerBound <= upperBound;
    return {
      lowerBound: Number(lowerBound.toFixed(3)),
      upperBound: Number(upperBound.toFixed(3)),
      isFeasible,
    };
  }

  /**
   * Calculates the feasible end interval [lowerBound, upperBound].
   * Enforces zero bleed: upperBound is strictly bounded by next speech onset minus safety margin.
   */
  public static calculateFeasibleEndInterval(
    targetWord: WordTimestamp,
    allWords: WordTimestamp[],
    options: {
      speechSafetyMarginSec?: number;
      sourceDurationSec?: number;
      hardMaxEndSec?: number;
    } = {}
  ): { lowerBound: number; upperBound: number; nextSpeechStart?: number } {
    const safetyMargin = options.speechSafetyMarginSec ?? 0.08;
    const sourceDuration = options.sourceDurationSec ?? Infinity;
    const hardMaxEnd = options.hardMaxEndSec ?? Infinity;

    // Hybrid structural + temporal adjacency: structural ordering determines direction,
    // and temporal non-overlap (w.start > targetWord.end) guarantees safety against ASR overlaps.
    const chronoWords = [...allWords].sort((a, b) => a.start - b.start || a.end - b.end);
    const targetIdx = chronoWords.findIndex(
      (w) => w === targetWord || (Math.abs(w.start - targetWord.start) <= 0.001 && Math.abs(w.end - targetWord.end) <= 0.001)
    );
    let nextWord: WordTimestamp | undefined;
    if (targetIdx >= 0) {
      for (let i = targetIdx + 1; i < chronoWords.length; i++) {
        if (chronoWords[i].start > targetWord.end) {
          nextWord = chronoWords[i];
          break;
        }
      }
    } else {
      nextWord = chronoWords.find((w) => w.start > targetWord.end + 0.02);
    }
    const nextSpeechStart = nextWord?.start;


    const lowerBound = targetWord.end;
    let upperBound = nextSpeechStart !== undefined
      ? Math.max(lowerBound, nextSpeechStart - safetyMargin)
      : sourceDuration;

    upperBound = Math.min(upperBound, hardMaxEnd);

    return {
      lowerBound: Number(lowerBound.toFixed(3)),
      upperBound: Number(upperBound.toFixed(3)),
      nextSpeechStart,
    };
  }

  /**
   * Snaps raw clip start and end timestamps to natural speech and acoustic boundaries.
   * 
   * Invariants Enforced:
   * 1. Never cut mid-word (Zero-Truncation Guard).
   * 2. When safeUpperBoundSec is provided, never bleed into next speech onset.
   * 3. When safeLowerBoundSec is provided, never pull in preceding sentence residue.
   * 4. Zero snowball cascade: Post-roll does not recursively shift across words.
   */
  static snap(
    rawStartSec: number,
    rawEndSec: number,
    words: WordTimestamp[],
    silences: AudioSilenceInterval[] = [],
    options: {
      minDurationSec?: number;
      maxDurationSec?: number;
      hardMaxDurationSec?: number;
      preRollMs?: number;
      postRollMs?: number;
      speechSafetyMarginMs?: number;
      searchWindowSec?: number;
      sourceDurationSec?: number;
      safeUpperBoundSec?: number;
      safeLowerBoundSec?: number;
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
      // ─────────────────────────────────────────────────────────────
      // 1. START BOUNDARY SNAPPING
      // ─────────────────────────────────────────────────────────────
      const intersectingStartWord = words.find(
        (w) => rawStartSec > w.start && rawStartSec < w.end
      );

      if (intersectingStartWord) {
        finalStart = Math.max(0, intersectingStartWord.start - preRollSec);
        startSnappedTo = 'word_start';
        truncatedWordAvoided = true;
      } else {
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

      const activeStartWord = intersectingStartWord || words.find(w => Math.abs(w.start - rawStartSec) <= searchWindowSec);
      if (activeStartWord) {
        const feasibleStart = this.calculateFeasibleStartInterval(activeStartWord, words);
        if (!feasibleStart.isFeasible) {
          // Overlapping/noisy timestamps: clamp start directly to activeStartWord.start
          finalStart = activeStartWord.start;
        } else {
          finalStart = Math.max(feasibleStart.lowerBound, finalStart);
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

      // Respect safeLowerBoundSec if provided
      if (options.safeLowerBoundSec !== undefined) {
        finalStart = Math.max(options.safeLowerBoundSec, finalStart);
      }

      // ─────────────────────────────────────────────────────────────
      // 2. END BOUNDARY SNAPPING
      // ─────────────────────────────────────────────────────────────
      const intersectingEndWord = words.find(
        (w) => rawEndSec > w.start && rawEndSec < w.end
      );

      if (intersectingEndWord) {
        finalEnd = intersectingEndWord.end + postRollSec;
        endSnappedTo = 'word_end';
        truncatedWordAvoided = true;
      } else {
        const candidateEndWords = words.filter(
          (w) => Math.abs(w.end - rawEndSec) <= searchWindowSec
        );

        if (candidateEndWords.length > 0) {
          const closestWord = candidateEndWords.reduce((prev, curr) => {
            const isPrevPunct = /[.?!]$/.test(prev.word.trim());
            const isCurrPunct = /[.?!]$/.test(curr.word.trim());
            const prevDist = Math.abs(prev.end - rawEndSec) - (isPrevPunct ? 0.4 : 0);
            const currDist = Math.abs(curr.end - rawEndSec) - (isCurrPunct ? 0.4 : 0);
            return currDist < prevDist ? curr : prev;
          });
          finalEnd = closestWord.end + postRollSec;
          endSnappedTo = 'word_end';
        }
      }

      // Check acoustic silence right after candidate end
      const succeedingSilence = silences.find(
        (s) => s.start >= finalEnd - postRollSec && s.start <= finalEnd + 0.8
      );
      if (succeedingSilence) {
        finalEnd = succeedingSilence.start + 0.1;
        endSnappedTo = 'silence';
      }

      // Respect safeUpperBoundSec if provided (Strict Zero-Bleed)
      if (options.safeUpperBoundSec !== undefined) {
        finalEnd = Math.min(options.safeUpperBoundSec, finalEnd);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. DURATION INTEGRITY CLAMPING WITH WORD PROTECTION
    // ─────────────────────────────────────────────────────────────
    const computedDuration = finalEnd - finalStart;
    if (computedDuration < minDur) {
      finalEnd = finalStart + minDur;
      // Prevent duration clamping from cutting inside an active word
      if (words.length > 0) {
        const intersectingClampedWord = words.find(
          (w) => finalEnd > w.start && finalEnd < w.end
        );
        if (intersectingClampedWord) {
          finalEnd = intersectingClampedWord.end + postRollSec;
          truncatedWordAvoided = true;
        }
      }
      if (options.safeUpperBoundSec !== undefined) {
        finalEnd = Math.min(options.safeUpperBoundSec, finalEnd);
      }
    } else if (computedDuration > maxDur) {
      finalEnd = finalStart + maxDur;
      if (words.length > 0) {
        const intersectingClampedWord = words.find(
          (w) => finalEnd > w.start && finalEnd < w.end
        );
        if (intersectingClampedWord) {
          finalEnd = Math.max(finalStart + minDur, intersectingClampedWord.start - 0.05);
          truncatedWordAvoided = true;
        }
      }
      if (options.safeUpperBoundSec !== undefined) {
        finalEnd = Math.min(options.safeUpperBoundSec, finalEnd);
      }
    }

    if (options.hardMaxDurationSec !== undefined) {
      finalEnd = Math.min(finalStart + options.hardMaxDurationSec, finalEnd);
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
      safeUpperBoundSec: options.safeUpperBoundSec,
      safeLowerBoundSec: options.safeLowerBoundSec,
    };
  }
}
