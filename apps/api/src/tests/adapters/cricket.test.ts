import { CricketAdapter } from '../../services/intelligence/adapters/CricketAdapter';
import { createDefaultContext } from '../../services/intelligence/PipelineContext';

describe('CricketAdapter', () => {
  let adapter: CricketAdapter;

  beforeAll(() => {
    adapter = new CricketAdapter();
  });

  it('detects boundary six events in transcripts', async () => {
    const context = createDefaultContext('test-job');
    context.transcriptSegments = [
      { text: "And he hits it out of the ground! That's a massive six!", start: 30, end: 33 }
    ];

    const detectors = adapter.getDetectors();
    const boundaryDetector = detectors.find(d => d.name === 'CricketBoundaryDetector');
    expect(boundaryDetector).toBeDefined();

    const events = await boundaryDetector!.detect('video.mp4', context);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('six');
    expect(events[0].start).toBe(27); // (30 - 3)
    expect(events[0].end).toBe(35);   // (33 + 2)
  });

  it('detects boundary four events in transcripts', async () => {
    const context = createDefaultContext('test-job');
    context.transcriptSegments = [
      { text: "It races away to the boundary fence for four!", start: 50, end: 53 }
    ];

    const detectors = adapter.getDetectors();
    const boundaryDetector = detectors.find(d => d.name === 'CricketBoundaryDetector');
    expect(boundaryDetector).toBeDefined();

    const events = await boundaryDetector!.detect('video.mp4', context);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('four');
  });

  it('detects wickets in transcripts', async () => {
    const context = createDefaultContext('test-job');
    context.transcriptSegments = [
      { text: "Got him! Clean bowled, what a wicket!", start: 45, end: 48 }
    ];

    const detectors = adapter.getDetectors();
    const wicketDetector = detectors.find(d => d.name === 'CricketWicketDetector');
    expect(wicketDetector).toBeDefined();

    const events = await wicketDetector!.detect('video.mp4', context);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('wicket');
  });

  it('detects century achievements in transcripts', async () => {
    const context = createDefaultContext('test-job');
    context.transcriptSegments = [
      { text: "He reaches his hundred and raises his bat to the crowd!", start: 60, end: 63 }
    ];

    const detectors = adapter.getDetectors();
    const centuryDetector = detectors.find(d => d.name === 'CricketCenturyDetector');
    expect(centuryDetector).toBeDefined();

    const events = await centuryDetector!.detect('video.mp4', context);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('century');
  });
});
