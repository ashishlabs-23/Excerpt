import { RewardModelEngine } from '../intelligence/RewardModelEngine';
import { RewardValidator, PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import { Logger } from '@excerpt/shared';

describe('V5.7 Reward Model Validation', () => {
  
  describe('RewardValidator (Pure core logic)', () => {
    it('throws PipelineError if rewards are out of bounds (RM-1)', () => {
      expect(() => {
        RewardValidator.validateBounds(1.5, 'compositeReward');
      }).toThrowError(PipelineError);

      expect(() => {
        RewardValidator.validateBounds(-0.1, 'viralityScore');
      }).toThrowError(PipelineError);
    });

    it('passes successfully for valid [0.0, 1.0] bounds', () => {
      expect(() => {
        RewardValidator.validateBounds(0.0, 'compositeReward');
        RewardValidator.validateBounds(1.0, 'compositeReward');
        RewardValidator.validateBounds(0.5, 'compositeReward');
      }).not.toThrow();
    });
  });

  describe('RewardModelEngine (I/O bounds)', () => {
    let engine: RewardModelEngine;
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger('rm-test' as any);
      jest.spyOn(logger, 'info').mockImplementation(() => {});
      jest.spyOn(logger, 'warn').mockImplementation(() => {});
      jest.spyOn(logger, 'error').mockImplementation(() => {});
      engine = new RewardModelEngine(logger);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('gracefully degrades to 0.5 fallback on out-of-bounds LLM output (RM-3)', async () => {
      const mockLLM = async () => {
        return { compositeReward: 9.9 }; // Way out of bounds
      };

      const result = await engine.evaluateCandidate('job-1', 'clip-1', {}, mockLLM);
      
      expect(result.isFallback).toBe(true);
      expect(result.compositeReward).toBe(0.5);
      expect(result.dimensions.viralityScore).toBe(0.5);
      expect(logger.error).toHaveBeenCalled();
    });

    it('gracefully degrades to 0.5 fallback on Promise timeout (RM-3)', async () => {
      const mockLLM = async () => {
        return new Promise<any>((resolve) => setTimeout(resolve, 20000)); // Deliberate timeout
      };

      const result = await engine.evaluateCandidate('job-1', 'clip-1', {}, mockLLM);
      
      expect(result.isFallback).toBe(true);
      expect(result.compositeReward).toBe(0.5);
    }, 25000);

    it('returns exact signal on valid LLM output', async () => {
      const mockLLM = async () => {
        return { 
          compositeReward: 0.85, 
          dimensions: {
            retentionProbability: 0.9,
            viralityScore: 0.8,
            pacingQuality: 0.85
          }
        };
      };

      const result = await engine.evaluateCandidate('job-1', 'clip-1', {}, mockLLM);
      
      expect(result.isFallback).toBe(false);
      expect(result.compositeReward).toBe(0.85);
      expect(result.modelSchemaVersion).toBe('v5.7.0');
    });
  });
});
