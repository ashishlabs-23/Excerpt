import {
  createSingleSubjectComposition,
  createSplitStackComposition,
  validateCompositionPlan,
  CompositionPlan,
} from '../composition/CompositionPlan';
import {
  createClipProject,
  updateProjectTranscriptWord,
  ClipProject,
} from '../project/ClipProject';
import {
  compileClipBundleMetadata,
} from '../project/ClipBundle';
import { SmartReframeEngine } from '../director/SmartReframeEngine';
import { FramingLevel } from '../director/types';

describe('CompositionPlan, ClipProject & ClipBundle Suite', () => {
  describe('CompositionPlan', () => {
    it('creates and validates a standard single-subject composition', () => {
      const plan = createSingleSubjectComposition({ x: 420, y: 0, width: 1080, height: 1920 });
      expect(plan.mode).toBe('single_subject');
      expect(plan.canvas.width).toBe(1080);
      expect(plan.canvas.height).toBe(1920);
      expect(plan.tracks).toHaveLength(1);
      expect(plan.tracks[0].role).toBe('primary_speaker');

      const validation = validateCompositionPlan(plan);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('creates and validates a stacked split-screen composition for dual speakers', () => {
      const topCrop = { x: 100, y: 0, width: 800, height: 1080 };
      const botCrop = { x: 1000, y: 0, width: 800, height: 1080 };
      const plan = createSplitStackComposition(topCrop, botCrop);

      expect(plan.mode).toBe('split_stack');
      expect(plan.tracks).toHaveLength(2);
      expect(plan.tracks[0].canvasPlacement.height).toBe(960);
      expect(plan.tracks[1].canvasPlacement.height).toBe(960);
      expect(plan.tracks[1].canvasPlacement.y).toBe(960);
      expect(plan.divider?.enabled).toBe(true);

      const validation = validateCompositionPlan(plan);
      expect(validation.valid).toBe(true);
    });
  });

  describe('SmartReframeEngine Composition Integration', () => {
    it('synthesizes split_stack composition when multi-speaker turn-taking is detected', () => {
      const dummyArtifact = {
        id: 'art_test',
        sourceUrl: 'test.mp4',
        durationSec: 10,
        durationMs: 10000,
        storagePath: 'test.mp4',
        fileSizeBytes: 1000,
        containerFormat: 'mp4',
        videoStreams: [{ index: 0, codec: 'h264', width: 1920, height: 1080, fps: 25, durationSec: 10 }],
        audioStreams: [],
      };

      const dualSpeakerFrames = Array.from({ length: 30 }, (_, i) => ({
        timestampMs: i * 40,
        durationMs: 40,
        faces: {
          available: true,
          data: [
            { x: 0.15, y: 0.2, w: 0.18, h: 0.25, confidence: 0.95 },
            { x: 0.65, y: 0.2, w: 0.18, h: 0.25, confidence: 0.95 },
          ],
        },
        persons: { available: false, data: [] },
        speaker: {
          available: true,
          data: {
            activeSpeakerBox: { x: 0.15, y: 0.2, w: 0.18, h: 0.25 },
            confidence: 0.9,
          },
        },
        transcriptWords: { available: false, data: [] },
        objects: { available: false, data: [] },
        scene: { available: false, data: null },
        motion: { available: false, data: null },
        audioEnergy: { available: false, data: null },
        pitch: { available: false, data: null },
        emotion: { available: false, data: null },
        visualSaliency: { available: false, data: null },
        cameraMotion: { available: false, data: null },
      }));

      const plan = SmartReframeEngine.generatePlan(dummyArtifact as any, dualSpeakerFrames as any, {
        targetAspectRatio: 9 / 16,
        maxVelocityPxPerSec: 800,
        jitterThresholdPx: 5,
        headroomPaddingRatio: 0.25,
      });

      expect(plan.layoutMode).toBe('split_screen_stack');
      expect(plan.composition).toBeDefined();
      expect(plan.composition?.mode).toBe('split_stack');
      expect(plan.composition?.tracks).toHaveLength(2);
    });
  });

  describe('ClipProject (Non-Destructive State)', () => {
    it('creates initial project state and updates words without re-encoding', () => {
      const comp = createSingleSubjectComposition({ x: 0, y: 0, width: 1080, height: 1920 });
      const project = createClipProject({
        id: 'clip_001',
        jobId: 'job_123',
        sourceMediaId: 'media_abc',
        startTime: 10.0,
        endTime: 25.0,
        composition: comp,
        words: [
          { word: 'Hello', start: 10.1, end: 10.5 },
          { word: 'world', start: 10.6, end: 11.0 },
        ],
        titles: ['Epic Greeting'],
      });

      expect(project.version).toBe(1);
      expect(project.transcript.words).toHaveLength(2);
      expect(project.hook.headline).toBe('Epic Greeting');

      // Edit word non-destructively
      const tokenId = project.transcript.words[0].id;
      const updated = updateProjectTranscriptWord(project, tokenId, 'Greetings');

      expect(updated.version).toBe(2);
      expect(updated.transcript.words[0].word).toBe('Greetings');
      expect(updated.transcript.words[1].word).toBe('world');
    });
  });

  describe('ClipBundle Deliverable', () => {
    it('compiles packaging metadata with hashtags and platform properties', () => {
      const meta = compileClipBundleMetadata({
        titleCandidates: ['Hook 1', 'Hook 2'],
        description: 'Check out this podcast highlight.',
        hashtags: ['viral', '#podcast'],
        videoId: 'vid_999',
        start: 12.3456,
        end: 45.6789,
        predictedViralityScore: 92,
      });

      expect(meta.titleCandidates).toHaveLength(2);
      expect(meta.hashtags).toEqual(['#viral', '#podcast']);
      expect(meta.source.start).toBe(12.35);
      expect(meta.source.end).toBe(45.68);
      expect(meta.predictedViralityScore).toBe(92);
    });
  });
});
