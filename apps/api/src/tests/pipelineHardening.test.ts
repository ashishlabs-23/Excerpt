import { BoundaryPolicyLoader } from '../services/intelligence/BoundaryPolicyLoader';
import { GraphBuilderService } from '../services/intelligence/GraphBuilderService';
import { GeminiReasoningProvider, StoryMemory } from '../services/intelligence/StoryReasoningProvider';
import { StoryBuilderService } from '../services/intelligence/StoryBuilderService';
import { VideoIntelligenceGraph } from '../services/intelligence/VideoGraph';
import { EventGraph, EventNode } from '../services/intelligence/EventGraph';

describe('Pipeline Hardening & Resilience Tests', () => {
  describe('BoundaryPolicyLoader', () => {
    it('returns valid fallback default policies when DB cache is empty', () => {
      const loader = BoundaryPolicyLoader.getInstance();
      const defaultPolicy = loader.getDefaultPolicy('LateWinner');
      
      expect(defaultPolicy).toBeDefined();
      expect(defaultPolicy.stage).toBe('promoted');
      expect(defaultPolicy.avg_pre_context).toBeGreaterThanOrEqual(2.5);
      expect(defaultPolicy.avg_post_context).toBeGreaterThanOrEqual(2.0);
      expect(defaultPolicy.confidence).toBeGreaterThan(0.5);

      // getPromotedPolicy returns fallback policy rather than null
      const promoted = loader.getPromotedPolicy('LateWinner');
      expect(promoted).not.toBeNull();
      expect(promoted?.avg_pre_context).toBe(4.5);
    });

    it('handles ensureInitialized without throwing on missing DB', async () => {
      const loader = BoundaryPolicyLoader.getInstance();
      await expect(loader.ensureInitialized()).resolves.not.toThrow();
    });
  });

  describe('GraphBuilderService - Adaptive Visual Sampling', () => {
    const builder = new GraphBuilderService();

    it('calculates higher sampling resolution for short videos and bound limits for long videos', () => {
      const shortFrames = builder.calculateAdaptiveMaxFrames(45);
      expect(shortFrames).toBeGreaterThanOrEqual(45);
      expect(shortFrames).toBeLessThanOrEqual(120);

      const mediumFrames = builder.calculateAdaptiveMaxFrames(300); // 5 min
      expect(mediumFrames).toBeGreaterThanOrEqual(90);
      expect(mediumFrames).toBeLessThanOrEqual(200);

      const longFrames = builder.calculateAdaptiveMaxFrames(3600); // 1 hour
      expect(longFrames).toBeGreaterThanOrEqual(200);
      expect(longFrames).toBeLessThanOrEqual(360);

      const veryLongFrames = builder.calculateAdaptiveMaxFrames(7200); // 2 hours
      expect(veryLongFrames).toBeGreaterThanOrEqual(250);
      expect(veryLongFrames).toBeLessThanOrEqual(480);
    });

    it('respects EXCERPT_MAX_ANALYSIS_FRAMES environment override', () => {
      const originalEnv = process.env.EXCERPT_MAX_ANALYSIS_FRAMES;
      process.env.EXCERPT_MAX_ANALYSIS_FRAMES = '150';
      try {
        expect(builder.calculateAdaptiveMaxFrames(3600)).toBe(150);
      } finally {
        if (originalEnv !== undefined) {
          process.env.EXCERPT_MAX_ANALYSIS_FRAMES = originalEnv;
        } else {
          delete process.env.EXCERPT_MAX_ANALYSIS_FRAMES;
        }
      }
    });
  });

  describe('StoryReasoningProvider & StoryBuilderService', () => {
    it('bounds memory to prevent context token growth', () => {
      const provider = new GeminiReasoningProvider();
      const largeMemory: StoryMemory = {
        characters: Array.from({ length: 30 }, (_, i) => `char_${i}`),
        topics: Array.from({ length: 25 }, (_, i) => `topic_${i}`),
        openLoops: Array.from({ length: 15 }, (_, i) => `loop_${i}`),
      };

      const bounded = provider.boundMemory(largeMemory);
      expect(bounded.characters.length).toBeLessThanOrEqual(15);
      expect(bounded.topics.length).toBeLessThanOrEqual(10);
      expect(bounded.openLoops.length).toBeLessThanOrEqual(5);
    });

    it('generates valid fallback stories with complete scores and boundaries when events occur', () => {
      const provider = new GeminiReasoningProvider();
      const sampleEvents: EventNode[] = [
        {
          id: 'ev_1',
          type: 'GOAL',
          timestamp: 10.0,
          duration: 4.0,
          confidence: 0.95,
          importance: 0.98,
          description: 'Incredible top corner strike',
          characters: ['player_10'],
        },
        {
          id: 'ev_2',
          type: 'CROWD_EXPLOSION',
          timestamp: 14.0,
          duration: 6.0,
          confidence: 0.90,
          importance: 0.85,
          description: 'Stadium roars with joy',
          characters: ['crowd'],
        },
      ];

      const result = provider.generateFallbackStories(sampleEvents, { characters: [], topics: [], openLoops: [] });
      expect(result.stories.length).toBe(1);
      const story = result.stories[0];
      expect(story.boundaries.hook_start).toBe(10.0);
      expect(story.boundaries.resolution).toBe(20.0);
      expect(story.confidence).toBeGreaterThan(0.7);
      expect(story.scores.hook).toBeDefined();
      expect(result.updatedMemory.characters).toContain('player_10');
    });

    it('buildStoryGraph processes graph with fallback provider seamlessly', async () => {
      const provider = new GeminiReasoningProvider();
      const builder = new StoryBuilderService(provider);

      const vig = new VideoIntelligenceGraph('test.mp4', 60);
      vig.category = 'football';

      const eventGraph = new EventGraph();
      eventGraph.addEvent({
        id: 'ev_test_1',
        type: 'SHOT',
        timestamp: 15.0,
        duration: 3.0,
        confidence: 0.88,
        importance: 0.85,
        description: 'Close shot on goal',
        characters: ['striker'],
      });

      const storyGraph = await builder.buildStoryGraph(vig, eventGraph);
      expect(storyGraph).toBeDefined();
      expect(storyGraph.stories.length).toBeGreaterThanOrEqual(1);
      expect(storyGraph.stories[0].boundaries.hook_start).toBe(15.0);
    });
  });

  describe('Boundary Clamping Logic', () => {
    it('symmetrically clamps sub-15s clips to meet the 15s threshold without exceeding bounds', () => {
      const sourceDuration = 60.0;
      const minDuration = 15.0;
      
      // Suppose a clip was trimmed to 14.0s (from 20.0 to 34.0)
      let start = 20.0;
      let end = 34.0;
      let duration = end - start;
      expect(duration).toBe(14.0);

      // Apply the clamping algorithm
      if (duration < minDuration && sourceDuration >= minDuration) {
        const deficit = minDuration - duration;
        const expandBack = Math.min(start, deficit / 2);
        const expandForward = Math.min(sourceDuration - end, deficit - expandBack);
        const remainingDeficit = deficit - (expandBack + expandForward);
        const finalBack = Math.min(start, expandBack + remainingDeficit);

        start = Math.max(0, Number((start - finalBack).toFixed(3)));
        end = Math.min(sourceDuration, Number((end + expandForward).toFixed(3)));
        duration = end - start;
      }

      expect(duration).toBeCloseTo(15.0, 2);
      expect(start).toBe(19.5);
      expect(end).toBe(34.5);
    });

    it('clamps near video start without going negative', () => {
      const sourceDuration = 60.0;
      const minDuration = 15.0;
      let start = 0.2;
      let end = 14.2;
      let duration = end - start;

      if (duration < minDuration && sourceDuration >= minDuration) {
        const deficit = minDuration - duration;
        const expandBack = Math.min(start, deficit / 2);
        const expandForward = Math.min(sourceDuration - end, deficit - expandBack);
        const remainingDeficit = deficit - (expandBack + expandForward);
        const finalBack = Math.min(start, expandBack + remainingDeficit);

        start = Math.max(0, Number((start - finalBack).toFixed(3)));
        end = Math.min(sourceDuration, Number((end + expandForward).toFixed(3)));
        duration = end - start;
      }

      expect(start).toBe(0.0);
      expect(end).toBe(15.0);
      expect(duration).toBe(15.0);
    });
  });
});
