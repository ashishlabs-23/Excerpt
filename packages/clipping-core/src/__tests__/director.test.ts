import { SmartReframeEngine } from '../director/SmartReframeEngine';
import { FramingLevel } from '../director/types';
import { MediaArtifact } from '../ingestion/types';
import { PerceptionFrame } from '../perception/types';

function createMockFrame(
  timestampMs: number,
  faces: any[] = [],
  speakerConf: number = 0.9
): PerceptionFrame {
  return {
    timestampMs,
    durationMs: 500,
    transcriptWords: { available: false, data: null },
    speaker: { available: true, data: { activeSpeakerId: 'spk1', confidence: speakerConf } },
    faces: { available: faces.length > 0, data: faces },
    persons: { available: false, data: [] },
    objects: { available: false, data: null },
    scene: { available: false, data: null },
    motion: { available: false, data: null },
    audioEnergy: { available: false, data: null },
    pitch: { available: false, data: null },
    emotion: { available: false, data: null },
    visualSaliency: { available: false, data: null },
    cameraMotion: { available: false, data: null },
  };
}

describe('SmartReframeEngine Multi-Layout & Director AI', () => {
  const sampleArtifact: MediaArtifact = {
    sourceType: 'local',
    originalUrlOrPath: 'sample.mp4',
    localPath: '/tmp/sample.mp4',
    mimeType: 'video/mp4',
    fileSizeBytes: 1024 * 1024 * 10,
    durationMs: 30000,
    width: 1920,
    height: 1080,
    fps: 30,
    hasVideoStream: true,
    hasAudioStream: true,
    hasAudio: true,
    checksumSha256: 'abc123hash',
  };

  it('generates single_speaker active speaker crop with smooth tracking', () => {
    const frames: PerceptionFrame[] = [
      createMockFrame(0, [{ x: 400, y: 200, w: 200, h: 200 }]),
      createMockFrame(500, [{ x: 450, y: 200, w: 200, h: 200 }]),
    ];

    const plan = SmartReframeEngine.generatePlan(sampleArtifact, frames, {
      targetAspectRatio: 9 / 16,
      maxVelocityPxPerSec: 500,
      jitterThresholdPx: 10,
      headroomPaddingRatio: 0.25,
      preferredLayout: 'single_speaker',
    });

    expect(plan.layoutMode).toBe('single_speaker');
    expect(plan.keyframes.length).toBeGreaterThan(0);
    expect(plan.keyframes[0].framingLevel).toBe(FramingLevel.ACTIVE_SPEAKER);
    expect(plan.keyframes[0].cropBox.w).toBe(1080 * (9 / 16));
  });

  it('generates split_screen_stack when two speakers are present', () => {
    const frames: PerceptionFrame[] = [
      createMockFrame(0, [
        { x: 200, y: 250, w: 220, h: 220 }, // Speaker A (left)
        { x: 1200, y: 250, w: 220, h: 220 }, // Speaker B (right)
      ]),
    ];

    const plan = SmartReframeEngine.generatePlan(sampleArtifact, frames, {
      targetAspectRatio: 9 / 16,
      maxVelocityPxPerSec: 500,
      jitterThresholdPx: 10,
      headroomPaddingRatio: 0.25,
      preferredLayout: 'auto',
    });

    expect(plan.keyframes[0].framingLevel).toBe(FramingLevel.SPLIT_SCREEN_STACK);
    expect(plan.keyframes[0].secondaryCropBox).toBeDefined();
  });

  describe('ContextualDirectorEngine (Phase C)', () => {
    const { ContextualDirectorEngine } = require('../director/ContextualDirectorEngine');
    const { getDirectorProfile } = require('../director/DirectorProfiles');
    const director = new ContextualDirectorEngine();

    it('enforces Ponytail Rule: does NOT punch in when sentence is strong but visual/emotion event is absent', () => {
      const clip = {
        candidateId: 'cand-conservative-01',
        startSec: 0.0,
        endSec: 15.0,
        genre: 'Podcast',
        words: [
          { word: 'This', start: 0.0, end: 0.3 },
          { word: 'is', start: 0.4, end: 0.6 },
          { word: 'a', start: 0.7, end: 0.8 },
          { word: 'completely', start: 0.9, end: 1.4 },
          { word: 'normal', start: 1.5, end: 1.9 },
          { word: 'statement.', start: 2.0, end: 2.5 },
        ],
      };

      // Perception with no emotion peaks
      const perception = {
        faces: [{ x: 0.45, y: 0.25, w: 0.2, h: 0.25, confidence: 0.95 }],
        emotionPeaks: [],
      };

      const plan = director.planDirection(clip, perception);
      expect(plan.selectedPlanType).toBe('conservative');
      expect(plan.interventions.length).toBe(0);
      expect(plan.shots[0].zoomScale).toBe(1.0);
      expect(plan.qualityGate.passed).toBe(true);
    });

    it('generates contextual punch-in when justified by high emotion spike + semantic climax', () => {
      const clip = {
        candidateId: 'cand-punch-02',
        startSec: 0.0,
        endSec: 18.0,
        genre: 'Podcast',
        words: [
          { word: 'We', start: 0.0, end: 0.3 },
          { word: 'lost', start: 0.4, end: 0.7 },
          { word: 'two', start: 0.8, end: 1.1 },
          { word: 'million', start: 5.5, end: 6.2 },
          { word: 'dollars!', start: 6.3, end: 7.0 },
        ],
      };

      const perception = {
        faces: [{ x: 0.45, y: 0.25, w: 0.2, h: 0.25, confidence: 0.95 }],
        emotionPeaks: [
          { timestampSec: 6.0, score: 0.95, emotion: 'shock' },
        ],
      };

      const plan = director.planDirection(clip, perception);
      expect(plan.selectedPlanType).toBe('contextual_punch');
      expect(plan.interventions.length).toBe(1);
      expect(plan.interventions[0].targetScale).toBeGreaterThan(1.0);
      expect(plan.interventions[0].targetScale).toBeLessThanOrEqual(1.18);
      expect(plan.qualityGate.passed).toBe(true);
      expect(plan.qualityGate.headCutoffDetected).toBe(false);
    });

    it('enforces minHoldDurationSec to prevent hyper-metronomic camera switching', () => {
      const clip = {
        candidateId: 'cand-hold-03',
        startSec: 0.0,
        endSec: 12.0,
        genre: 'Interview', // Interview has 3.5s hold requirement
        words: [
          { word: 'First', start: 2.0, end: 2.5 },
          { word: 'Second', start: 3.5, end: 4.0 }, // Only 1.5s after first peak
        ],
      };

      const perception = {
        faces: [{ x: 0.45, y: 0.25, w: 0.2, h: 0.25, confidence: 0.92 }],
        emotionPeaks: [
          { timestampSec: 2.2, score: 0.92, emotion: 'anger' },
          { timestampSec: 3.8, score: 0.95, emotion: 'excitement' }, // Too close!
        ],
      };

      const plan = director.planDirection(clip, perception);
      // Second peak must be rejected due to minHoldDuration constraint
      expect(plan.interventions.length).toBeLessThanOrEqual(1);
      expect(plan.qualityGate.unnecessaryInterventionCount).toBe(0);
    });

    it('generates speaker_aware split-screen stack when multiple speakers are present in debate/podcast', () => {
      const clip = {
        candidateId: 'cand-split-04',
        startSec: 0.0,
        endSec: 15.0,
        genre: 'Debate',
      };

      const perception = {
        faces: [
          { x: 0.2, y: 0.25, w: 0.2, h: 0.25, confidence: 0.92 },
          { x: 0.7, y: 0.25, w: 0.2, h: 0.25, confidence: 0.88 },
        ],
      };

      const plan = director.planDirection(clip, perception);
      expect(plan.selectedPlanType).toBe('speaker_aware');
      expect(plan.shots[0].framing).toBe(FramingLevel.SPLIT_SCREEN_STACK);
      expect(plan.qualityGate.passed).toBe(true);
    });

    it('loads genre-specific profiles tailored to Tutorial, Sports, and Gaming', () => {
      const sportsProfile = getDirectorProfile('Sports');
      const tutorialProfile = getDirectorProfile('Tutorial');

      // Tutorial forbids high punch-in to preserve screen action
      expect(tutorialProfile.maxZoomScale).toBeLessThanOrEqual(1.06);
      expect(tutorialProfile.interventionThreshold).toBeGreaterThan(85);

      // Sports has high motion weight
      expect(sportsProfile.weights.motion).toBeGreaterThanOrEqual(0.35);
    });
  });
});

