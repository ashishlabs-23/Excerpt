/**
 * AudioPeakDetector - Detects energetic audio moments (cheers, laughs, screams, volume spikes)
 * Inspired by PeakCut (https://github.com/haziqahmedqasmi/PeakCut) loudness-based highlight detection.
 *
 * Runs locally, deterministic, fast (<10ms).
 */

export interface AudioEnergyPoint {
  second: number;
  energy: number; // 0.0 to 1.0 (or normalized RMS)
}

export interface AudioPeakCandidate {
  startSec: number;
  endSec: number;
  peakSec: number;
  score: number; // 0 - 100
  energyProminence: number;
  label: string;
}

export interface AudioPeakOptions {
  targetDurationSec?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  energyThreshold?: number; // default: 0.65
  prePeakLeadSec?: number;  // lead-in context before peak (default: 4.0s)
}

export class AudioPeakDetector {
  /**
   * Detects highlight candidate segments anchored around volume and energy peaks.
   */
  public detectPeaks(
    timeline: AudioEnergyPoint[],
    totalDurationSec: number,
    options: AudioPeakOptions = {}
  ): AudioPeakCandidate[] {
    if (!timeline || timeline.length === 0 || totalDurationSec <= 0) {
      return [];
    }

    const minDur = Math.max(5, options.minDurationSec ?? 15);
    const maxDur = Math.min(totalDurationSec, options.maxDurationSec ?? 60);
    const targetDur = Math.min(maxDur, Math.max(minDur, options.targetDurationSec ?? 30));
    const leadSec = options.prePeakLeadSec ?? 4.0;
    const threshold = options.energyThreshold ?? 0.60;

    // 1. Calculate statistics (mean & standard deviation)
    const energies = timeline.map(p => p.energy);
    const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    const variance = energies.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / energies.length;
    const stdDev = Math.sqrt(variance);

    // Dynamic peak cutoff: either absolute threshold or mean + 1.25 * stdDev
    const peakCutoff = Math.max(threshold, mean + 1.25 * stdDev);

    // 2. Identify local maxima above the cutoff
    const rawPeaks: { second: number; energy: number; prominence: number }[] = [];
    for (let i = 0; i < timeline.length; i++) {
      const curr = timeline[i];
      if (curr.energy >= peakCutoff) {
        const prev = i > 0 ? timeline[i - 1].energy : 0;
        const next = i < timeline.length - 1 ? timeline[i + 1].energy : 0;
        // Check if local crest
        if (curr.energy >= prev && curr.energy >= next) {
          const prominence = curr.energy - mean;
          rawPeaks.push({ second: curr.second, energy: curr.energy, prominence });
        }
      }
    }

    if (rawPeaks.length === 0) {
      // Fallback: If no sharp peak exceeded cutoff, take highest energy window
      const sortedByEnergy = [...timeline].sort((a, b) => b.energy - a.energy);
      if (sortedByEnergy.length > 0) {
        const top = sortedByEnergy[0];
        rawPeaks.push({ second: top.second, energy: top.energy, prominence: top.energy - mean });
      }
    }

    // 3. Cluster peaks and expand into valid candidate clip time windows
    const candidates: AudioPeakCandidate[] = [];
    // Sort peaks descending by prominence
    rawPeaks.sort((a, b) => b.prominence - a.prominence);

    for (const peak of rawPeaks) {
      // Center or place lead context before the peak
      let start = Math.max(0, peak.second - leadSec);
      let end = Math.min(totalDurationSec, start + targetDur);

      // Adjust if clamped at end
      if (end - start < minDur) {
        start = Math.max(0, end - minDur);
      }

      // Check if overlapping substantially with an already selected peak
      const isOverlap = candidates.some(existing => {
        const overlapStart = Math.max(existing.startSec, start);
        const overlapEnd = Math.min(existing.endSec, end);
        return Math.max(0, overlapEnd - overlapStart) > targetDur * 0.5;
      });

      if (!isOverlap) {
        const normalizedScore = Math.min(100, Math.max(40, Math.round(50 + (peak.prominence / (stdDev || 0.1)) * 18)));
        candidates.push({
          startSec: Number(start.toFixed(2)),
          endSec: Number(end.toFixed(2)),
          peakSec: Number(peak.second.toFixed(2)),
          score: normalizedScore,
          energyProminence: Number(peak.prominence.toFixed(3)),
          label: `Audio Peak (${Number(peak.second.toFixed(1))}s, ${Math.round(peak.energy * 100)}% energy)`,
        });
      }

      if (candidates.length >= 8) break;
    }

    return candidates.sort((a, b) => b.score - a.score);
  }
}

export const audioPeakDetector = new AudioPeakDetector();
