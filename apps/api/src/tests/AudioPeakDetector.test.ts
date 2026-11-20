import { AudioPeakDetector } from '../services/intelligence/AudioPeakDetector';

describe('AudioPeakDetector (PeakCut Highlight Model)', () => {
  const detector = new AudioPeakDetector();

  it('detects high-energy audio peaks and calculates reasonable clip boundaries', () => {
    // 60-second video with background noise 0.2, and loud spikes at 20s and 45s
    const timeline = Array.from({ length: 60 }, (_, i) => ({
      second: i,
      energy: i === 20 ? 0.95 : i === 45 ? 0.88 : 0.15 + (Math.sin(i) * 0.05),
    }));

    const peaks = detector.detectPeaks(timeline, 60, {
      targetDurationSec: 25,
      minDurationSec: 15,
      maxDurationSec: 30,
      prePeakLeadSec: 5,
    });

    expect(peaks.length).toBeGreaterThanOrEqual(1);
    const topPeak = peaks[0];
    expect(topPeak.peakSec).toBe(20);
    expect(topPeak.startSec).toBeLessThanOrEqual(15);
    expect(topPeak.endSec - topPeak.startSec).toBeGreaterThanOrEqual(15);
    expect(topPeak.score).toBeGreaterThan(60);
  });

  it('gracefully handles empty timeline or flat audio', () => {
    expect(detector.detectPeaks([], 0)).toEqual([]);

    const flatTimeline = Array.from({ length: 30 }, (_, i) => ({ second: i, energy: 0.2 }));
    const peaks = detector.detectPeaks(flatTimeline, 30);
    expect(peaks.length).toBe(1); // fallback top window
  });
});
