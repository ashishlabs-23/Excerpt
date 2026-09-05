import { VisualActivity } from '../services/nexus/VisualActivity';
import { AudioIntelligence } from '../services/nexus/AudioIntelligence';
import { HookIntelligence } from '../services/nexus/HookIntelligence';

describe('Nexus Intelligence Signals - Windowing & Relative Offsets', () => {
  describe('HookIntelligence', () => {
    const hookIntelligence = new HookIntelligence();

    it('accurately scores a high-velocity hook starting late in the video', async () => {
      // Clip starts at 120.0s
      const clipStart = 120.0;
      const segments = [
        {
          start: 120.2,
          end: 122.5,
          text: 'Why do so many creators make this huge mistake?',
        },
        {
          start: 122.6,
          end: 124.8,
          text: 'Because they completely ignore their first three seconds.',
        },
      ];

      const signal = await hookIntelligence.getSignal(
        'dummy.mp4',
        'Why do so many creators make this huge mistake? Because they completely ignore their first three seconds.',
        segments,
        clipStart
      );

      expect(signal.status).toBe('success');
      expect(signal.fallback_used).toBe(false);
      // High word count with intrigue questions and keywords should produce a high score >= 0.75
      expect(signal.score).toBeGreaterThanOrEqual(0.75);
      expect(signal.reason).toContain('Intrigue patterns detected');
    });

    it('penalizes a clip with substantial lead-in silence or low word density', async () => {
      // Clip starts at 50.0s, but speaker doesn't talk until 52.0s (2.0s silence)
      const clipStart = 50.0;
      const segments = [
        {
          start: 52.0,
          end: 54.5,
          text: 'Um, yeah.',
        },
      ];

      const signal = await hookIntelligence.getSignal(
        'dummy.mp4',
        'Um, yeah.',
        segments,
        clipStart
      );

      expect(signal.status).toBe('success');
      expect(signal.score).toBeLessThanOrEqual(0.40);
      expect(signal.reason).toContain('Delay: 2.00s');
    });
  });

  describe('AudioIntelligence & VisualActivity Interface contracts', () => {
    it('accepts optional startTime and duration parameters without throwing signature errors', async () => {
      const audio = new AudioIntelligence();
      const visual = new VisualActivity();

      // Non-existent file should trigger graceful fallback rather than crashing
      const audioSignal = await audio.getSignal('non_existent.mp4', 10.0, 20.0);
      expect(audioSignal.status).toBe('skipped');
      expect(audioSignal.fallback_used).toBe(true);

      const visualSignal = await visual.getSignal('non_existent.mp4', 10.0, 20.0);
      expect(visualSignal.status).toBe('skipped');
      expect(visualSignal.fallback_used).toBe(true);
    });
  });
});
