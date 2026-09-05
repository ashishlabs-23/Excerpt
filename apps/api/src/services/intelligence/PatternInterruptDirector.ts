export interface PatternInterruptWindow {
  startSec: number;
  endSec: number;
  scale: number; // e.g. 1.18 for punch-in
  reason: string;
}

export interface PatternInterruptPlan {
  enabled: boolean;
  windows: PatternInterruptWindow[];
  filtergraph: string;
}

export class PatternInterruptDirector {
  private readonly defaultPunchScale = 1.18;

  /**
   * Plans human editor-style 3-second pattern interrupts (snap punch-in zooms).
   * Aligns punch-in cuts to natural spoken sentence/word boundaries.
   */
  public planInterrupts(
    durationSec: number,
    words: Array<{ word: string; start: number; end: number }> = [],
    options: {
      scaledWidth: number;
      scaledHeight: number;
      cropWidth: number;
      cropHeight: number;
      targetCropX: number;
      targetCropY: number;
      speakerNormX?: number;
      speakerNormY?: number;
      enabled?: boolean;
    }
  ): PatternInterruptPlan {
    const {
      scaledWidth,
      scaledHeight,
      cropWidth,
      cropHeight,
      targetCropX,
      targetCropY,
      speakerNormX = 0.5,
      speakerNormY = 0.35,
      enabled = true,
    } = options;

    if (!enabled || durationSec < 7.0) {
      // For very short clips, keep single framing
      const baseFilter = `scale=${scaledWidth}:${scaledHeight}:flags=bicubic,crop=${cropWidth}:${cropHeight}:${targetCropX}:${targetCropY},setsar=1`;
      return {
        enabled: false,
        windows: [],
        filtergraph: baseFilter,
      };
    }

    // Human editorial pacing:
    // Every 3.5 - 5 seconds, toggle between 1.0x (context) and 1.18x (punch-in emphasis).
    const windows: PatternInterruptWindow[] = [];
    let currentTime = 3.5; // Start clip on 1.0x hook, punch in after ~3.5s

    while (currentTime + 2.5 < durationSec) {
      let punchStart = currentTime;
      let punchEnd = Math.min(durationSec - 1.0, punchStart + 3.5);

      // Snap punch-in start to nearest word start for rhythmic impact
      if (words.length > 0) {
        const nearestStartWord = words.find(w => Math.abs(w.start - punchStart) < 0.8);
        if (nearestStartWord && nearestStartWord.start < durationSec - 2.0) {
          punchStart = nearestStartWord.start;
        }
        const nearestEndWord = words.find(w => Math.abs(w.end - punchEnd) < 0.8);
        if (nearestEndWord && nearestEndWord.end > punchStart + 1.5) {
          punchEnd = nearestEndWord.end;
        }
      }

      if (punchEnd - punchStart >= 2.0) {
        windows.push({
          startSec: Number(punchStart.toFixed(2)),
          endSec: Number(punchEnd.toFixed(2)),
          scale: this.defaultPunchScale,
          reason: '3s-pattern-interrupt-punch-in',
        });
      }

      // Rest period (1.0x wide) for 4.0 - 5.0 seconds before next punch
      currentTime = punchEnd + 4.5;
    }

    if (windows.length === 0) {
      const baseFilter = `scale=${scaledWidth}:${scaledHeight}:flags=bicubic,crop=${cropWidth}:${cropHeight}:${targetCropX}:${targetCropY},setsar=1`;
      return {
        enabled: false,
        windows: [],
        filtergraph: baseFilter,
      };
    }

    // Compute punch-in framing (centered on speaker's face)
    const punchScale = this.defaultPunchScale;
    const punchW = Math.round(scaledWidth * punchScale);
    const punchH = Math.round(scaledHeight * punchScale);
    const maxOffsetPunchX = Math.max(0, punchW - cropWidth);
    const maxOffsetPunchY = Math.max(0, punchH - cropHeight);

    const punchCropX = Math.round(Math.max(0, Math.min(maxOffsetPunchX, speakerNormX * punchW - cropWidth / 2)));
    const idealPunchY = Math.round(speakerNormY * punchH - cropHeight * 0.35);
    const punchCropY = Math.round(Math.max(0, Math.min(maxOffsetPunchY, idealPunchY)));

    const baseFilter = `scale=${scaledWidth}:${scaledHeight}:flags=bicubic,crop=${cropWidth}:${cropHeight}:${targetCropX}:${targetCropY},setsar=1`;
    const tightFilter = `scale=${punchW}:${punchH}:flags=bicubic,crop=${cropWidth}:${cropHeight}:${punchCropX}:${punchCropY},setsar=1`;

    // Construct overlay enable expression: between(t, s1, e1)+between(t, s2, e2)...
    const enableExpr = windows
      .map(w => `between(t,${w.startSec.toFixed(2)},${w.endSec.toFixed(2)})`)
      .join('+');

    const filtergraph = `split=2[v_base][v_punch];[v_base]${baseFilter}[wide];[v_punch]${tightFilter}[tight];[wide][tight]overlay=0:0:enable='${enableExpr}'`;

    return {
      enabled: true,
      windows,
      filtergraph,
    };
  }
}
