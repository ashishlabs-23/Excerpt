import { CommentaryEmotionEngine } from '../services/intelligence/CommentaryEmotionEngine';
import { createDefaultContext } from '../services/intelligence/PipelineContext';
import { isMultiModalEnabled } from '../config/features';

jest.mock('../config/features', () => {
  const original = jest.requireActual('../config/features');
  return {
    __esModule: true,
    ...original,
    isMultiModalEnabled: jest.fn(),
  };
});

describe('CommentaryEmotionEngine', () => {
  let engine: CommentaryEmotionEngine;
  let mockIsMultiModalEnabled: jest.MockedFunction<typeof isMultiModalEnabled>;

  beforeEach(() => {
    engine = new CommentaryEmotionEngine();
    mockIsMultiModalEnabled = isMultiModalEnabled as jest.MockedFunction<typeof isMultiModalEnabled>;
    mockIsMultiModalEnabled.mockReturnValue(true);
  });

  it('respects the commentary_engine feature flag', async () => {
    mockIsMultiModalEnabled.mockImplementation((feature) => {
      if (feature === 'commentary_engine') return false;
      return true;
    });

    const context = createDefaultContext('job-123');
    const results = await engine.analyze('dummy.mp4', context);
    expect(results).toEqual([]);
  });

  it('correctly calculates emotion scores and assigns labels', async () => {
    const context = createDefaultContext('job-123');
    
    // Set up mock segments:
    // Segment 0: Calm, slow speaking rate
    // Segment 1: High excitement, exclamation mark, emotional keywords, fast speaking rate
    context.transcriptSegments = [
      { text: "This is a quiet segment where nothing is happening.", start: 0, end: 5 },
      { text: "UNBELIEVABLE! THAT'S AN AMAZING GOAL FROM OUT OF NOWHERE! MY GOODNESS!", start: 10, end: 12 },
    ];

    // Mock crowd timeline to supply volume spikes for segment 1
    context.crowdTimeline = [
      { timestamp: 0, score: 20, label: 'calm' },
      { timestamp: 2, score: 25, label: 'calm' },
      { timestamp: 10, score: 90, label: 'eruption' },
      { timestamp: 11, score: 95, label: 'eruption' },
    ];

    const results = await engine.analyze('dummy.mp4', context);

    expect(results).toHaveLength(2);

    // Segment 0 (Calm)
    expect(results[0].level).toBe('calm');
    expect(results[0].timestamp).toBe(2.5); // (0+5)/2

    // Segment 1 (Excited / Historic)
    expect(results[1].level).not.toBe('calm');
    expect(results[1].score).toBeGreaterThan(results[0].score);
    expect(results[1].timestamp).toBe(11); // (10+12)/2
    expect(context.commentaryEmotions).toEqual(results);
  });
});
