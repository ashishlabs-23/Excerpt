import { UnderstandingEngine } from '../UnderstandingEngine';
import { LLMOrchestrator } from '../llm/LLMOrchestrator';
import { GraphValidator } from '../graphs/GraphValidator';
import { GraphCeiling } from '../graphs/GraphCeiling';
import { PipelineErrorCode, CorrelationId, SceneGraph, StoryGraph, MomentGraph, TopicGraph, UnderstandingConfig, MediaArtifact } from '@excerpt/clipping-core';
import { Logger } from '@excerpt/shared';

describe('Temporal Understanding Engine', () => {
  let mockLogger: Logger;
  let config: UnderstandingConfig;
  const DURATION_MS = 10000; // 10 seconds

  beforeEach(() => {
    mockLogger = new Logger('corr-123' as CorrelationId);
    config = { maxNodesPerMinute: 60, modelName: 'test-model' };
  });

  describe('GraphValidator', () => {
    it('1. timestamp integrity (all intervals within media duration)', () => {
      const nodes = [
        { startMs: -100, endMs: 5000, confidence: 1.0, description: '' }, // invalid start
        { startMs: 5000, endMs: 12000, confidence: 1.0, description: '' }, // exceeds duration
        { startMs: 6000, endMs: 5500, confidence: 1.0, description: '' }  // start >= end
      ];
      
      const errors = GraphValidator.validate(nodes, DURATION_MS, true);
      expect(errors).toHaveLength(3);
      expect(errors[0]).toContain('negative startMs');
      expect(errors[1]).toContain('exceeds media duration');
      expect(errors[2]).toContain('invalid interval');
    });

    it('2. graph continuity (no overlapping when they shouldn\'t be)', () => {
      const nodes = [
        { startMs: 0, endMs: 5000, confidence: 1.0, description: '' },
        { startMs: 4000, endMs: 9000, confidence: 1.0, description: '' } // Overlaps
      ];
      
      const errors = GraphValidator.validate(nodes, DURATION_MS, false); // allowOverlap = false
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('overlaps with previous node');
    });
  });

  describe('LLMOrchestrator', () => {
    let orchestrator: LLMOrchestrator;

    beforeEach(() => {
      orchestrator = new LLMOrchestrator(mockLogger);
    });

    it('3. deterministic serialization (schema mismatch caught)', async () => {
      const badGenerator = jest.fn().mockResolvedValue({ notNodes: [] });
      
      await expect(orchestrator.generateGraphWithRetry(badGenerator, 'prompt', DURATION_MS, 'TestGraph'))
        .rejects.toMatchObject({
          code: PipelineErrorCode.GraphConstructionFailed
        });
      
      // Should have tried twice (initial + retry)
      expect(badGenerator).toHaveBeenCalledTimes(2);
    });

    it('4. malformed model output triggers retry-then-fail', async () => {
      const badOutput1 = { nodes: [{ startMs: -1, endMs: 10, confidence: 1.0, description: '' }] }; // Invalid timestamp
      const badOutput2 = { nodes: [{ startMs: 5, endMs: 2, confidence: 1.0, description: '' }] };  // Invalid order
      
      const generator = jest.fn()
        .mockResolvedValueOnce(badOutput1)
        .mockResolvedValueOnce(badOutput2);
      
      await expect(orchestrator.generateGraphWithRetry(generator, 'prompt', DURATION_MS, 'TestGraph'))
        .rejects.toMatchObject({
          code: PipelineErrorCode.GraphConstructionFailed,
          message: expect.stringContaining('invalid interval')
        });

      // Exactly two calls
      expect(generator).toHaveBeenCalledTimes(2);
      // The second call's prompt should contain the corrective string
      expect(generator.mock.calls[1][0]).toContain('PREVIOUS ERROR');
    });
  });

  describe('GraphCeiling', () => {
    it('5. node-count ceiling enforced on a long synthetic input', () => {
      // Create 100 nodes for a 1 minute video (60,000ms)
      // Ceiling is set to 60 nodes per minute.
      const nodes = Array.from({ length: 100 }).map((_, i) => ({
        startMs: i * 500,
        endMs: (i + 1) * 500,
        confidence: i / 100, // Higher index = higher confidence
        description: `Node ${i}`
      }));

      const truncated = GraphCeiling.enforceCeiling(nodes, 60000, config, mockLogger, 'TestGraph');
      
      expect(truncated).toHaveLength(60);
      
      // Since higher index had higher confidence, the top 60 should be retained
      // Check that the lowest confidence node present is at least 0.40 (indices 40-99 retained)
      const minConfidence = Math.min(...truncated.map(n => n.confidence));
      expect(minConfidence).toBeGreaterThanOrEqual(0.40);

      // Verify they are re-sorted chronologically after truncation
      for (let i = 1; i < truncated.length; i++) {
        expect(truncated[i].startMs).toBeGreaterThan(truncated[i-1].startMs);
      }
    });
  });
});
