export class ComputeCeiling {
  /**
   * Calculates a frame sampling rate (Hz) to cap total tracking compute based on media duration.
   * Long videos require lower sampling rates to stay within CostLedger bounds.
   */
  static calculateSamplingRate(durationMs: number, maxComputeFrames: number = 3000): number {
    const durationSec = durationMs / 1000;
    const requiredHz = Math.floor(maxComputeFrames / durationSec);
    
    // Hard bound between 1Hz and 10Hz
    return Math.max(1, Math.min(10, requiredHz));
  }
}
