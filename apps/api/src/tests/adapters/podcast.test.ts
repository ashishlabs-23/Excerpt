import { PodcastAdapter } from '../../services/intelligence/adapters/PodcastAdapter';
import { createDefaultContext } from '../../services/intelligence/PipelineContext';

describe('PodcastAdapter', () => {
  let adapter: PodcastAdapter;

  beforeAll(() => {
    adapter = new PodcastAdapter();
  });

  it('runs fallbackClipService and creates key_insight events', async () => {
    const context = createDefaultContext('test-job');
    context.duration = 60;
    context.transcriptSegments = [
      { text: "Today we have a very special guest joining us for episode 5.", start: 10, end: 15 },
      { text: "That is an interesting question, let's talk about the story.", start: 20, end: 25 },
      { text: "And that wraps up our podcast today. See you next time!", start: 50, end: 55 }
    ];

    const detectors = adapter.getDetectors();
    const podcastDetector = detectors.find(d => d.name === 'PodcastEventDetector');
    expect(podcastDetector).toBeDefined();

    const events = await podcastDetector!.detect('video.mp4', context);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('key_insight');
    expect(events[0].adapter).toBe('podcast');
  });
});
