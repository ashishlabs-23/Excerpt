import { GenerativeVisualEngine } from '../services/intelligence/GenerativeVisualEngine';
import { performancePredictionEngine } from '../services/intelligence/PerformancePredictionEngine';
import { createDefaultContext } from '../services/intelligence/PipelineContext';
import { SmartReframeEngine } from '@excerpt/clipping-core';
import { FramingLevel } from '@excerpt/clipping-core';

describe('Advanced Clipping Pipeline Advancements', () => {
  describe('Phase E: Contextual B-Roll & Visual Augmentation', () => {
    it('plans B-roll moments for semantic keywords with proper timing spacing', () => {
      const visualEngine = new GenerativeVisualEngine();
      const words = [
        { word: 'Welcome', start: 0.2, end: 0.6 },
        { word: 'to', start: 0.7, end: 0.9 },
        { word: 'the', start: 1.0, end: 1.2 },
        { word: 'show', start: 1.3, end: 1.6 },
        { word: 'today', start: 1.7, end: 2.1 },
        { word: 'we', start: 2.2, end: 2.4 },
        { word: 'discuss', start: 2.5, end: 2.9 },
        { word: 'money', start: 3.0, end: 3.5 },
        { word: 'and', start: 3.6, end: 3.8 },
        { word: 'huge', start: 3.9, end: 4.2 },
        { word: 'revenue', start: 4.3, end: 4.8 },
        { word: 'plus', start: 7.0, end: 7.3 },
        { word: 'our', start: 7.4, end: 7.6 },
        { word: 'secret', start: 7.7, end: 8.2 },
      ];

      const moments = visualEngine.planBRollMoments(words, 0, 15, 3);
      expect(moments.length).toBeGreaterThanOrEqual(2);
      expect(moments[0].keyword).toBe('money');
      expect(moments[0].style).toBe('financial_metric');
      expect(moments[0].startSec).toBeGreaterThanOrEqual(2.0); // Never clobbers the opening talking head
      expect(moments[1].keyword).toBe('secret');
    });
  });

  describe('Multi-Speaker Split-Screen Auto-Framing', () => {
    it('generates a split_stack composition plan when dual prominent speakers exist', () => {
      const artifact: any = {
        id: 'test-art',
        durationMs: 10000,
        width: 1920,
        height: 1080,
        fps: 30,
        storageKey: 'test.mp4',
        checksum: 'hash',
        mimeType: 'video/mp4',
        sourceUrl: 'http://test.mp4',
        sizeBytes: 1000,
        fileSizeBytes: 1000,
        sourceType: 'youtube',
        originalUrlOrPath: 'http://test.mp4',
        localPath: '/tmp/test.mp4',
        createdAt: new Date().toISOString()
      };

      // Two spatially separated faces (Speaker 1 at X=0.20, Speaker 2 at X=0.75)
      const frames: any[] = [
        {
          timestampMs: 0,
          faces: [
            { id: 'spk1', x: 0.20, y: 0.25, width: 0.22, height: 0.35, confidence: 0.95 },
            { id: 'spk2', x: 0.75, y: 0.25, width: 0.22, height: 0.35, confidence: 0.95 }
          ]
        },
        {
          timestampMs: 2000,
          faces: [
            { id: 'spk1', x: 0.20, y: 0.25, width: 0.22, height: 0.35, confidence: 0.95 },
            { id: 'spk2', x: 0.75, y: 0.25, width: 0.22, height: 0.35, confidence: 0.95 }
          ]
        },
        {
          timestampMs: 5000,
          faces: [
            { id: 'spk1', x: 0.20, y: 0.25, width: 0.22, height: 0.35, confidence: 0.95 },
            { id: 'spk2', x: 0.75, y: 0.25, width: 0.22, height: 0.35, confidence: 0.95 }
          ]
        }
      ];

      const config = {
        targetAspectRatio: 9 / 16,
        maxVelocityPxPerSec: 500,
        jitterThresholdPx: 10,
        headroomPaddingRatio: 0.25,
        preferredLayout: 'split_screen_stack' as const
      };

      const cameraPlan = SmartReframeEngine.generatePlan(artifact, frames, config);
      expect(cameraPlan.layoutMode).toBe('split_screen_stack');
      expect(cameraPlan.composition).toBeDefined();
      expect(cameraPlan.composition?.mode).toBe('split_stack');
      expect(cameraPlan.composition?.tracks).toHaveLength(2);
      expect(cameraPlan.composition?.tracks[0].canvasPlacement.height).toBe(960);
      expect(cameraPlan.composition?.tracks[1].canvasPlacement.height).toBe(960);
      expect(cameraPlan.composition?.divider?.enabled).toBe(true);
    });
  });

  describe('Phase F: Performance Prediction Engine V2', () => {
    it('computes composite virality index, tier, and platform scores correctly', () => {
      const context = createDefaultContext('perf-job-1');
      context.curiosity = { 'clip-top': { curiosity_score: 92 } };
      context.payoff = { 'clip-top': { payoff_strength: 88 } };
      context.narrative = { 'clip-top': { narrative_score: 85 } };
      context.retention = {
        'clip-top': {
          retention_score: 86,
          expected_completion_rate: 82,
          expected_rewatch_rate: 28
        }
      };
      context.viralPatterns = {
        'clip-top': {
          pattern: 'Massive Mistake',
          confidence: 90,
          historical_performance: 88
        }
      };
      context.transcriptSegments = [
        { text: 'never make this massive mistake in your life because it costs you everything and here is why.', start: 0, end: 10 }
      ];

      const result = performancePredictionEngine.predict('clip-top', 0, 10, context);
      expect(result.virality_index).toBeGreaterThanOrEqual(85);
      expect(result.virality_tier).toMatch(/top_1%|top_5%/);
      expect(result.platform_fit.tiktok).toBeGreaterThan(70);
      expect(result.platform_fit.youtube_shorts).toBeGreaterThan(70);
      expect(result.key_drivers.length).toBeGreaterThan(0);
      expect(context.performancePrediction?.['clip-top']).toBeDefined();
    });
  });
});
