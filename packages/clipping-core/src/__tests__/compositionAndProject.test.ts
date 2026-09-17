import {
  createSingleSubjectComposition,
  createSplitStackComposition,
  createScreenPlusFaceComposition,
  validateCompositionPlan,
  CompositionPlan,
} from '../composition/CompositionPlan';
import {
  createClipProject,
  deriveNextProjectVersion,
  updateProjectTranscriptWord,
  ClipProject,
} from '../project/ClipProject';
import {
  compileClipBundleMetadata,
} from '../project/ClipBundle';
import {
  createPublicationPlan,
  PLATFORM_CAPABILITIES,
} from '../project/PublicationPlan';
import { SmartReframeEngine } from '../director/SmartReframeEngine';
import { FramingLevel } from '../director/types';

describe('CompositionPlan, ClipProject & ClipBundle Suite', () => {
  describe('CompositionPlan & Overlap Policy', () => {
    it('creates and validates a standard single-subject composition', () => {
      const plan = createSingleSubjectComposition({ x: 420, y: 0, width: 1080, height: 1920 });
      expect(plan.mode).toBe('single_subject');
      expect(plan.canvas.width).toBe(1080);
      expect(plan.canvas.height).toBe(1920);
      expect(plan.tracks).toHaveLength(1);
      expect(plan.tracks[0].role).toBe('primary_speaker');
      expect(plan.tracks[0].overlapPolicy).toBe('forbidden');

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

    it('allows overlapping tracks when overlapPolicy is allowed (e.g., screen_plus_face picture-in-picture)', () => {
      const screenCrop = { x: 0, y: 0, width: 1920, height: 1080 };
      const faceCrop = { x: 400, y: 200, width: 400, height: 400 };
      const pipPlan = createScreenPlusFaceComposition(screenCrop, faceCrop);

      expect(pipPlan.mode).toBe('screen_plus_face');
      expect(pipPlan.tracks).toHaveLength(2);
      expect(pipPlan.tracks[1].overlapPolicy).toBe('allowed');

      const validation = validateCompositionPlan(pipPlan);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('detects and rejects collisions when overlapping tracks both specify overlapPolicy forbidden', () => {
      const collisionPlan: CompositionPlan = {
        mode: 'split_stack',
        canvas: { width: 1080, height: 1920, aspectRatio: '9:16' },
        tracks: [
          {
            id: 't1',
            sourceId: 's1',
            role: 'primary_speaker',
            sourceCrop: { x: 0, y: 0, width: 500, height: 500 },
            canvasPlacement: { x: 0, y: 0, width: 1080, height: 1200 },
            zIndex: 0,
            overlapPolicy: 'forbidden',
          },
          {
            id: 't2',
            sourceId: 's2',
            role: 'secondary_speaker',
            sourceCrop: { x: 0, y: 0, width: 500, height: 500 },
            canvasPlacement: { x: 0, y: 800, width: 1080, height: 1120 }, // Overlaps between y=800 and y=1200
            zIndex: 0,
            overlapPolicy: 'forbidden',
          },
        ],
        safeZones: [],
      };

      const validation = validateCompositionPlan(collisionPlan);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Collision'))).toBe(true);
    });
  });

  describe('SmartReframeEngine Composition Candidate Evaluation', () => {
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

    it('selects split_stack when sustained co-presence and spatial separation exist', () => {
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
      expect(plan.composition?.tracks[0].cameraPath?.keyframes.length).toBeGreaterThan(0);
    });

    it('favors single_subject when secondary face is a tiny background bystander', () => {
      const bystanderFrames = Array.from({ length: 30 }, (_, i) => ({
        timestampMs: i * 40,
        durationMs: 40,
        faces: {
          available: true,
          data: [
            { x: 0.45, y: 0.2, w: 0.22, h: 0.30, confidence: 0.95 },
            { x: 0.85, y: 0.5, w: 0.04, h: 0.05, confidence: 0.60 }, // Tiny bystander face (w < 0.08)
          ],
        },
        persons: { available: false, data: [] },
        speaker: {
          available: true,
          data: {
            activeSpeakerBox: { x: 0.45, y: 0.2, w: 0.22, h: 0.30 },
            confidence: 0.95,
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

      const plan = SmartReframeEngine.generatePlan(dummyArtifact as any, bystanderFrames as any, {
        targetAspectRatio: 9 / 16,
        maxVelocityPxPerSec: 800,
        jitterThresholdPx: 5,
        headroomPaddingRatio: 0.25,
      });

      expect(plan.layoutMode).toBe('single_speaker');
      expect(plan.composition?.mode).toBe('single_subject');
      expect(plan.composition?.tracks).toHaveLength(1);
    });
  });

  describe('ClipProject (Immutable Version Lineage)', () => {
    it('creates initial version 1 and derives version 2 with parent link without mutating v1', () => {
      const comp = createSingleSubjectComposition({ x: 0, y: 0, width: 1080, height: 1920 });
      const v1 = createClipProject({
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

      expect(v1.version).toBe(1);
      expect(v1.parentVersion).toBeNull();
      expect(v1.contentHash).toBeDefined();
      expect(v1.transcript.words).toHaveLength(2);
      expect(v1.hook.headline).toBe('Epic Greeting');

      // Edit word non-destructively in O(1) in-memory operation
      const tokenId = v1.transcript.words[0].id;
      const v2 = updateProjectTranscriptWord(v1, tokenId, 'Greetings');

      // Verify immutability of v1
      expect(v1.version).toBe(1);
      expect(v1.transcript.words[0].word).toBe('Hello');

      // Verify derived v2
      expect(v2.version).toBe(2);
      expect(v2.parentVersion).toBe(1);
      expect(v2.contentHash).not.toBe(v1.contentHash);
      expect(v2.transcript.words[0].word).toBe('Greetings');
      expect(v2.transcript.words[1].word).toBe('world');
    });
  });

  describe('ClipBundle & Explainable Scoring', () => {
    it('compiles packaging metadata with calibrated editorial evaluation and factor evidence', () => {
      const meta = compileClipBundleMetadata({
        titleCandidates: ['Hook 1', 'Hook 2'],
        description: 'Check out this podcast highlight.',
        hashtags: ['viral', '#podcast'],
        videoId: 'vid_999',
        start: 12.3456,
        end: 45.6789,
        selectionScore: 0.88,
        confidence: 0.82,
        scoreFactors: {
          hook: 0.92,
          completeness: 0.89,
          visual: 0.78,
          speaker: 0.94,
        },
      });

      expect(meta.titleCandidates).toHaveLength(2);
      expect(meta.hashtags).toEqual(['#viral', '#podcast']);
      expect(meta.source.start).toBe(12.35);
      expect(meta.source.end).toBe(45.68);
      expect(meta.editorialEvaluation.selectionScore).toBe(0.88);
      expect(meta.editorialEvaluation.confidence).toBe(0.82);
      expect(meta.editorialEvaluation.factors.hook).toBe(0.92);
      expect(meta.editorialEvaluation.factors.speaker).toBe(0.94);
    });
  });

  describe('PublicationPlan (Multi-Platform Contract)', () => {
    it('creates TikTok and YouTube publication plans adhering to platform capabilities', () => {
      const tiktokPlan = createPublicationPlan({
        id: 'pub_tt_01',
        projectId: 'proj_clip_001',
        clipId: 'clip_001',
        targetPlatform: 'tiktok',
        title: 'Insane Podcast Insight That Changed My Life Forever',
        hashtags: ['mindset', 'podcast'],
        authorizationState: 'authorized',
      });

      expect(tiktokPlan.targetPlatform).toBe('tiktok');
      expect(tiktokPlan.capabilities.supportsPullFromUrl).toBe(true);
      expect(tiktokPlan.capabilities.requiresCreatorReview).toBe(true);
      expect(tiktokPlan.transferMethod).toBe('pull_from_url');
      expect(tiktokPlan.copy.hashtags).toEqual(['#mindset', '#podcast']);

      const ytPlan = createPublicationPlan({
        id: 'pub_yt_01',
        projectId: 'proj_clip_001',
        clipId: 'clip_001',
        targetPlatform: 'youtube_shorts',
        title: 'Short Form Truth',
        authorizationState: 'authorized',
      });

      expect(ytPlan.targetPlatform).toBe('youtube_shorts');
      expect(ytPlan.capabilities.supportsPullFromUrl).toBe(false);
      expect(ytPlan.transferMethod).toBe('direct_post_upload');
    });
  });
});
