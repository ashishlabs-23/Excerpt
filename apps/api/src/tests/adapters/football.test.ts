import { FootballAdapter } from '../../services/intelligence/adapters/FootballAdapter';
import { createDefaultContext } from '../../services/intelligence/PipelineContext';

describe('FootballAdapter', () => {
  let adapter: FootballAdapter;

  beforeAll(() => {
    adapter = new FootballAdapter();
  });

  it('detects goal events in transcripts', async () => {
    const context = createDefaultContext('test-job');
    context.transcriptSegments = [
      { text: "What an incredible goal by the striker!", start: 15, end: 18 }
    ];

    const detectors = adapter.getDetectors();
    const goalDetector = detectors.find(d => d.name === 'FootballGoalDetector');
    expect(goalDetector).toBeDefined();

    const events = await goalDetector!.detect('video.mp4', context);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('goal');
    expect(events[0].start).toBe(12); // pre-roll subtraction (15 - 3)
    expect(events[0].end).toBe(20);   // post-roll addition (18 + 2)
  });

  it('detects red cards in transcripts', async () => {
    const context = createDefaultContext('test-job');
    context.transcriptSegments = [
      { text: "The referee has shown a red card to the defender!", start: 40, end: 43 }
    ];

    const detectors = adapter.getDetectors();
    const cardDetector = detectors.find(d => d.name === 'FootballCardDetector');
    expect(cardDetector).toBeDefined();

    const events = await cardDetector!.detect('video.mp4', context);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('red_card');
  });

  it('detects celebrations in transcripts', async () => {
    const context = createDefaultContext('test-job');
    context.transcriptSegments = [
      { text: "The stadium erupts and he slides towards the corner flag in celebration!", start: 20, end: 23 }
    ];

    const detectors = adapter.getDetectors();
    const celebrationDetector = detectors.find(d => d.name === 'FootballCelebrationDetector');
    expect(celebrationDetector).toBeDefined();

    const events = await celebrationDetector!.detect('video.mp4', context);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('celebration');
  });
});
