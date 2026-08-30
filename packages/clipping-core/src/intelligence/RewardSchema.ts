import { PipelineError, PipelineErrorCode } from '../errors/PipelineError';

export interface RewardDimensions {
  retentionProbability: number;
  viralityScore: number;
  pacingQuality: number;
}

export interface RewardSignal {
  jobId: string;
  candidateId: string;
  dimensions: RewardDimensions;
  compositeReward: number;
  modelSchemaVersion: string;
  isFallback: boolean;
}

export class RewardValidator {
  /**
   * Enforces RM-1: All reward values MUST be strictly bounded [0.0, 1.0]
   */
  static validateBounds(value: number, dimensionName: string): void {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new PipelineError(
        PipelineErrorCode.ValidationError, 
        `RewardCalculationFailed: ${dimensionName} must be a number`
      );
    }
    if (value < 0.0 || value > 1.0) {
      throw new PipelineError(
        PipelineErrorCode.ValidationError, 
        `RewardCalculationFailed: ${dimensionName} out of bounds. Expected [0.0, 1.0], got ${value}`
      );
    }
  }

  static validateSignal(signal: RewardSignal): void {
    this.validateBounds(signal.compositeReward, 'compositeReward');
    this.validateBounds(signal.dimensions.retentionProbability, 'retentionProbability');
    this.validateBounds(signal.dimensions.viralityScore, 'viralityScore');
    this.validateBounds(signal.dimensions.pacingQuality, 'pacingQuality');
    
    if (!signal.modelSchemaVersion) {
      throw new PipelineError(
        PipelineErrorCode.ValidationError,
        `RewardCalculationFailed: Missing modelSchemaVersion (RM-4)`
      );
    }
  }
}
