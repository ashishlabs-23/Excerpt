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
});
