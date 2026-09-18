import {
  buildVoiceoverPlan,
  validateVoiceoverPlan,
  parseDuoCommentary,
  VoiceoverPlan,
} from '../../services/voiceover/VoiceoverPlan';

describe('VoiceoverPlan Subsystem', () => {
  describe('buildVoiceoverPlan', () => {
    it('creates a canonical plan with default values and sorted segments', () => {
      const plan = buildVoiceoverPlan({
        sourceClipId: 'clip-123',
        sourceVideoUrl: '/path/to/video.mp4',
        targetDuration: 30,
        segments: [
          { startTime: 10, endTime: 15, text: 'Second segment' },
          { startTime: 0, endTime: 5, text: 'First segment' },
        ],
        defaultVoice: 'pNInz6obpgDQGcFmaJgB',
        defaultProvider: 'elevenlabs',
      });

      expect(plan.version).toBe('1.0');
      expect(plan.targetDuration).toBe(30);
      expect(plan.timeline.segments.length).toBe(2);
      // Chronologically sorted
      expect(plan.timeline.segments[0].text).toBe('First segment');
      expect(plan.timeline.segments[0].startTime).toBe(0);
      expect(plan.timeline.segments[1].text).toBe('Second segment');
      expect(plan.timeline.segments[1].startTime).toBe(10);
      expect(plan.originalAudioPolicy).toBe('duck');
      expect(plan.normalizationPolicy.targetLUFS).toBe(-16);
    });

    it('filters out segments with empty text', () => {
      const plan = buildVoiceoverPlan({
        sourceClipId: 'clip-empty',
        sourceVideoUrl: '/path/to/video.mp4',
        targetDuration: 15,
        segments: [
          { startTime: 0, endTime: 5, text: 'Valid speech' },
          { startTime: 6, endTime: 10, text: '   ' },
        ],
      });

      expect(plan.timeline.segments.length).toBe(1);
      expect(plan.timeline.segments[0].text).toBe('Valid speech');
    });

    it('defaults to 30 seconds if invalid or zero target duration provided', () => {
      const plan = buildVoiceoverPlan({
        sourceClipId: 'clip-zero',
        sourceVideoUrl: '/path/to/video.mp4',
        targetDuration: 0,
        segments: [{ startTime: 0, endTime: 1, text: 'Quick text' }],
      });

      expect(plan.targetDuration).toBe(30);
    });
  });

  describe('validateVoiceoverPlan', () => {
    it('validates a correct VoiceoverPlan successfully', () => {
      const plan = buildVoiceoverPlan({
        sourceClipId: 'clip-valid',
        sourceVideoUrl: '/path/to/video.mp4',
        targetDuration: 20,
        segments: [
          { startTime: 0, endTime: 5, text: 'Intro narration' },
          { startTime: 6, endTime: 12, text: 'Detailed narration' },
        ],
      });

      const validation = validateVoiceoverPlan(plan);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('rejects plan with empty timeline segments', () => {
      const emptyPlan: VoiceoverPlan = {
        version: '1.0',
        id: 'plan-empty',
        sourceClipId: 'clip-1',
        sourceVideoUrl: '/video.mp4',
        targetDuration: 20,
        timeline: { segments: [] },
        originalAudioPolicy: 'duck',
        duckingPolicy: { duckLevelDb: -14, attackMs: 25, releaseMs: 250 },
        normalizationPolicy: { enabled: true, targetLUFS: -16, truePeakDb: -1.5 },
        durationPolicy: 'clamp_to_video',
        outputFormat: { audioCodec: 'aac', audioBitrate: '192k', sampleRate: 48000 },
      };

      const validation = validateVoiceoverPlan(emptyPlan);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Timeline must contain at least one segment with text.');
    });

    it('rejects segment with negative start time', () => {
      const invalidPlan: VoiceoverPlan = {
        version: '1.0',
        id: 'plan-neg',
        sourceClipId: 'clip-1',
        sourceVideoUrl: '/video.mp4',
        targetDuration: 20,
        timeline: {
          segments: [
            { id: 's1', type: 'narration', startTime: -2, endTime: 5, text: 'Negative time' }
          ]
        },
        originalAudioPolicy: 'duck',
        duckingPolicy: { duckLevelDb: -14, attackMs: 25, releaseMs: 250 },
        normalizationPolicy: { enabled: true, targetLUFS: -16, truePeakDb: -1.5 },
        durationPolicy: 'clamp_to_video',
        outputFormat: { audioCodec: 'aac', audioBitrate: '192k', sampleRate: 48000 },
      };

      const validation = validateVoiceoverPlan(invalidPlan);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('startTime cannot be negative'))).toBe(true);
    });
  });

  describe('parseDuoCommentary', () => {
    it('parses formatted dialogue script into alternating speaker segments', () => {
      const script = `
        [Play-by-Play]: Incredible move down the right flank!
        [Color Analyst]: Look at that precision and acceleration!
        [Play-by-Play]: He takes the shot and scores!
      `;

      const segments = parseDuoCommentary(script, 18, {
        voiceA: 'voice-adam',
        voiceB: 'voice-rachel',
        providerA: 'elevenlabs',
        providerB: 'elevenlabs',
      });

      expect(segments.length).toBe(3);
      expect(segments[0].voice).toBe('voice-adam');
      expect(segments[0].text).toContain('Incredible move down the right flank!');
      expect(segments[1].voice).toBe('voice-rachel');
      expect(segments[1].text).toContain('Look at that precision and acceleration!');
      expect(segments[2].voice).toBe('voice-adam');
      expect(segments[2].text).toContain('He takes the shot and scores!');

      // Verify timing progression
      expect(segments[0].startTime).toBe(0);
      expect(segments[1].startTime).toBeGreaterThan(segments[0].startTime);
      expect(segments[2].startTime).toBeGreaterThan(segments[1].startTime);
      expect(segments[2].endTime).toBeLessThanOrEqual(18);
    });
  });
});
