import { SmartReframeEngine } from '../director/SmartReframeEngine';
import { ComputeCeiling } from '../director/ComputeCeiling';
import { DirectorConfig, FramingLevel } from '../director/types';
import { PerceptionFrame, PerceptionSignal } from '../perception/types';
import { MediaArtifact } from '../ingestion/types';

describe('Director AI + Smart Reframe Engine', () => {
  
  const mockArtifact: MediaArtifact = {
    sourceType: 'local',
    originalUrlOrPath: '',
    localPath: '',
    mimeType: 'video/mp4',
    fileSizeBytes: 0,
    durationMs: 10000,
    width: 1920,
    height: 1080,
    fps: 30,
    videoCodec: 'h264',
    audioCodec: 'aac',
    hasVideoStream: true,
    hasAudioStream: true,
    hasAudio: true,
    checksumSha256: 'test'
  };

  const defaultConfig: DirectorConfig = {
    targetAspectRatio: 9 / 16,
    maxVelocityPxPerSec: 500,
    jitterThresholdPx: 50,
    headroomPaddingRatio: 0.15
  };

  const sig = <T>(data: T | null): PerceptionSignal<T> => ({
    available: data !== null,
    data
  });

  const createMockFrame = (
    timestampMs: number,
    opts: {
      faces?: any[];
      persons?: any[];
      speaker?: string;
      speakerConfidence?: number;
    } = {}
  ): PerceptionFrame => ({
    timestampMs,
    durationMs: 100,
    transcriptWords: sig<any[]>([]),
    speaker: sig<{ id: string; confidence: number }>(opts.speaker ? { id: opts.speaker, confidence: opts.speakerConfidence ?? 1.0 } : null),
    faces: sig<any[]>(opts.faces ?? null),
    persons: sig<any[]>(opts.persons ?? null),
    objects: sig<any[]>(null),
    scene: sig<any>(null),
    motion: sig<any>(null),
    audioEnergy: sig<number>(null),
    pitch: sig<number>(null),
    emotion: sig<string>(null),
    visualSaliency: sig<any>(null),
    cameraMotion: sig<string>(null)
  });

  describe('ComputeCeiling', () => {
    it('scales sampling rate inversely with duration to cap compute', () => {
      expect(ComputeCeiling.calculateSamplingRate(10000, 3000)).toBe(10);
      expect(ComputeCeiling.calculateSamplingRate(3600000, 3000)).toBe(1);
    });
  });

  describe('SmartReframeEngine', () => {
    
    it('1. fallback precedence is followed in order, never skipping a level', () => {
      const frames = [
        createMockFrame(0, { faces: [{ x: 100, y: 100, w: 200, h: 200 }], speaker: 'A', speakerConfidence: 0.9 }),
        createMockFrame(100, { faces: [{} as any, {} as any], persons: [{} as any, {} as any], speaker: 'B', speakerConfidence: 0.9 }),
        createMockFrame(200, { faces: [{ x: 100, y: 100, w: 200, h: 200 }], speaker: 'A', speakerConfidence: 0.4 }),
        createMockFrame(300, {})
      ];

      const plan = SmartReframeEngine.generatePlan(mockArtifact, frames, defaultConfig);
      
      expect(plan.keyframes[0].framingLevel).toBe(FramingLevel.ACTIVE_SPEAKER);
      expect(plan.keyframes[1].framingLevel).toBe(FramingLevel.TWO_SPEAKER);
      expect(plan.keyframes[2].framingLevel).toBe(FramingLevel.WIDE_SHOT);
      expect(plan.keyframes[3].framingLevel).toBe(FramingLevel.CENTER_CROP);
    });

    it('2. no head/chin cutoff (numeric bounds check)', () => {
      const face = { x: 1500, y: 10, w: 200, h: 200 };
      const frames = [createMockFrame(0, { faces: [face], speaker: 'A', speakerConfidence: 0.9 })];

      const plan = SmartReframeEngine.generatePlan(mockArtifact, frames, defaultConfig);
      const kf = plan.keyframes[0];

      expect(kf.cropBox.x).toBeCloseTo(1296.25, 1);
    });

    it('3. crop-window velocity never exceeds the configured cap', () => {
      const frames = [
        createMockFrame(0, { faces: [{ x: 0, y: 100, w: 200, h: 200 }], speaker: 'A', speakerConfidence: 0.9 }),
        createMockFrame(100, { faces: [{ x: 1500, y: 100, w: 200, h: 200 }], speaker: 'A', speakerConfidence: 0.9 })
      ];

      const plan = SmartReframeEngine.generatePlan(mockArtifact, frames, defaultConfig);
      
      const x0 = plan.keyframes[0].cropBox.x;
      const x1 = plan.keyframes[1].cropBox.x;
      
      const actualDx = Math.abs(x1 - x0);
      expect(actualDx).toBeLessThanOrEqual(50);
    });

    it('4. speaker-switch framing does not oscillate faster than the jitter threshold', () => {
      const frames = [
        createMockFrame(0, { faces: [{ x: 500, y: 100, w: 200, h: 200 }], speaker: 'A', speakerConfidence: 0.9 }),
        createMockFrame(100, { faces: [{ x: 530, y: 100, w: 200, h: 200 }], speaker: 'A', speakerConfidence: 0.9 }),
        createMockFrame(200, { faces: [{ x: 470, y: 100, w: 200, h: 200 }], speaker: 'A', speakerConfidence: 0.9 })
      ];

      const plan = SmartReframeEngine.generatePlan(mockArtifact, frames, defaultConfig);
      
      const x0 = plan.keyframes[0].cropBox.x;
      const x1 = plan.keyframes[1].cropBox.x;
      const x2 = plan.keyframes[2].cropBox.x;
      
      expect(x1).toBe(x0);
      expect(x2).toBe(x0);
    });

    it('5. CameraPlan is deterministic given identical inputs', () => {
      const frames = [
        createMockFrame(0, { faces: [{ x: 100, y: 100, w: 200, h: 200 }], speaker: 'A', speakerConfidence: 0.9 }),
        createMockFrame(100, { faces: [{ x: 1500, y: 100, w: 200, h: 200 }], speaker: 'A', speakerConfidence: 0.9 })
      ];

      const plan1 = SmartReframeEngine.generatePlan(mockArtifact, frames, defaultConfig);
      const plan2 = SmartReframeEngine.generatePlan(mockArtifact, frames, defaultConfig);

      expect(plan1).toEqual(plan2);
    });
  });
});
