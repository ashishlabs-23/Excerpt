import { AcousticBoundarySnapper, WordTimestamp } from '../candidates/AcousticBoundarySnapper';

describe('AcousticBoundarySnapper - Punctuation & Duration Clamping', () => {
  const sampleWords: WordTimestamp[] = [
    { word: 'Welcome', start: 0.0, end: 0.5 },
    { word: 'to', start: 0.55, end: 0.7 },
    { word: 'the', start: 0.75, end: 0.9 },
    { word: 'show.', start: 0.95, end: 1.4 },
    { word: 'Today', start: 1.5, end: 1.8 },
    { word: 'we', start: 1.85, end: 2.0 },
    { word: 'discuss', start: 2.05, end: 2.5 },
    { word: 'viral', start: 2.55, end: 2.9 },
    { word: 'clips!', start: 2.95, end: 3.5 },
    { word: 'Wait', start: 3.6, end: 3.9 },
    { word: 'there', start: 3.95, end: 4.2 },
    { word: 'is', start: 4.25, end: 4.4 },
    { word: 'more', start: 4.45, end: 4.8 },
    // Word at 15.0 boundary
    { word: 'spanning', start: 14.8, end: 15.4 },
    { word: 'conclusion.', start: 15.5, end: 16.2 },
  ];

  it('prefers a word ending with terminal punctuation over an unpunctuated word in search window', () => {
    // rawEnd at 3.58s (in pause between 'clips!' ending at 3.5s and 'Wait' starting at 3.6s)
    const result = AcousticBoundarySnapper.snap(0.0, 3.58, sampleWords, [], {
      minDurationSec: 2.0,
      maxDurationSec: 10.0,
      postRollMs: 200,
      searchWindowSec: 1.0,
    });

    // Should prefer 'clips!' ending at 3.5 + 0.2 = 3.7s
    expect(result.endSec).toBeCloseTo(3.7, 1);
  });

  it('prevents duration clamping from cutting inside an active word at minDuration', () => {
    // minDuration is 15.0s, starting at 0.0s. 15.0s falls right inside 'spanning' (14.8 -> 15.4s)
    const result = AcousticBoundarySnapper.snap(0.0, 10.0, sampleWords, [], {
      minDurationSec: 15.0,
      maxDurationSec: 30.0,
      postRollMs: 200,
    });

    // Clamping should not cut at 15.0s, but should extend past 'spanning' (15.4s + 0.2s = 15.6s)
    expect(result.truncatedWordAvoided).toBe(true);
    expect(result.endSec).toBeGreaterThanOrEqual(15.4);
  });
});
