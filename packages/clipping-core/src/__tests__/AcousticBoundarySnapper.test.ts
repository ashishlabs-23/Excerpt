import { AcousticBoundarySnapper, WordTimestamp, AudioSilenceInterval } from '../candidates/AcousticBoundarySnapper';

describe('AcousticBoundarySnapper', () => {
  const sampleWords: WordTimestamp[] = [
    { word: 'Hello', start: 1.0, end: 1.4 },
    { word: 'everyone', start: 1.45, end: 1.9 },
    { word: 'welcome', start: 2.1, end: 2.5 },
    { word: 'to', start: 2.55, end: 2.7 },
    { word: 'this', start: 2.75, end: 2.9 },
    { word: 'video', start: 2.95, end: 3.4 },
    { word: 'today', start: 3.5, end: 3.9 },
    { word: 'we', start: 4.2, end: 4.4 },
    { word: 'are', start: 4.45, end: 4.6 },
    { word: 'talking', start: 4.65, end: 5.1 },
    { word: 'about', start: 5.15, end: 5.4 },
    { word: 'AI', start: 5.45, end: 5.8 },
    { word: 'clipping', start: 5.85, end: 6.3 },
    { word: 'pipelines', start: 6.35, end: 7.0 },
    // Later words to satisfy min duration
    { word: 'and', start: 15.0, end: 15.2 },
    { word: 'how', start: 15.25, end: 15.5 },
    { word: 'they', start: 15.55, end: 15.8 },
    { word: 'work', start: 15.85, end: 16.3 },
    { word: 'perfectly', start: 16.35, end: 17.0 },
  ];

  const sampleSilences: AudioSilenceInterval[] = [
    { start: 0.0, end: 0.95, duration: 0.95 },
    { start: 3.95, end: 4.15, duration: 0.2 },
    { start: 7.05, end: 14.95, duration: 7.9 },
    { start: 17.05, end: 18.0, duration: 0.95 },
  ];

  it('avoids cutting mid-word on start timestamp (Zero-Truncation)', () => {
    // 1.2s is in the middle of 'Hello' (1.0 -> 1.4)
    const result = AcousticBoundarySnapper.snap(1.2, 17.5, sampleWords, sampleSilences, {
      minDurationSec: 10.0,
      maxDurationSec: 30.0,
      preRollMs: 150,
      postRollMs: 250,
    });

    expect(result.truncatedWordAvoided).toBe(true);
    expect(['word_start', 'silence']).toContain(result.startSnappedTo);
    // Start should be shifted before 'Hello' start (1.0)
    expect(result.startSec).toBeLessThanOrEqual(1.0);
  });

  it('avoids cutting mid-word on end timestamp', () => {
    // 16.5s is in the middle of 'perfectly' (16.35 -> 17.0)
    const result = AcousticBoundarySnapper.snap(0.9, 16.5, sampleWords, sampleSilences, {
      minDurationSec: 10.0,
      maxDurationSec: 30.0,
      postRollMs: 200,
    });

    expect(result.truncatedWordAvoided).toBe(true);
    // End should extend to cover the full word plus post-roll (17.0 + 0.2 = 17.2)
    expect(result.endSec).toBeGreaterThanOrEqual(17.0);
  });

  it('snaps to acoustic silence when available nearby', () => {
    const result = AcousticBoundarySnapper.snap(1.0, 17.0, sampleWords, sampleSilences, {
      minDurationSec: 10.0,
      maxDurationSec: 30.0,
    });

    expect(result.endSnappedTo).toBe('silence');
    expect(result.durationSec).toBeGreaterThanOrEqual(10.0);
  });

  it('enforces min and max duration bounds correctly', () => {
    const resultShort = AcousticBoundarySnapper.snap(1.0, 3.0, sampleWords, [], {
      minDurationSec: 15.0,
      maxDurationSec: 60.0,
    });

    expect(resultShort.durationSec).toBeGreaterThanOrEqual(15.0);
  });
});
