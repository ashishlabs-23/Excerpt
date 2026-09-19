import { fallbackClipService } from '../services/fallbackClipService';
import { buildRecoveryClips } from '../workers/videoWorker';

describe('Virality Score Calibration & Baseline', () => {
  it('heuristic clips produced by fallbackClipService have virality_score >= 80', () => {
    const segments = [
      { start: 0, end: 5, text: 'This is the secret why nobody tells you the truth about building wealth.' },
      { start: 5, end: 12, text: 'The reason everyone fails is because they never focus on the system.' },
      { start: 12, end: 20, text: 'So what you need to do is change the framework and grow your audience.' },
      { start: 20, end: 28, text: 'That is why the results ended up being completely unbelievable.' },
      { start: 28, end: 35, text: 'Follow this process and you will scale your business.' },
    ];

    const clips = fallbackClipService.detectClips({
      segments,
      videoUrl: 'https://example.com/video.mp4',
      numClips: 2,
      totalDuration: 35,
    });

    expect(clips.length).toBeGreaterThan(0);
    for (const clip of clips) {
      expect(clip.virality_score).toBeGreaterThanOrEqual(80);
      expect(clip.clip_score).toBeGreaterThanOrEqual(80);
      expect(clip.virality_score).toBeLessThanOrEqual(98);
    }
  });

  it('recovery clips produced by buildRecoveryClips have virality_score >= 80', () => {
    const clips = buildRecoveryClips(60, 2);
    expect(clips.length).toBe(2);
    for (const clip of clips) {
      expect(clip.virality_score).toBeGreaterThanOrEqual(80);
      expect(clip.clip_score).toBeGreaterThanOrEqual(80);
    }
  });
});
