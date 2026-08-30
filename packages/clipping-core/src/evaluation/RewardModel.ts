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
  static validateBounds(value: number, fieldName: string = 'value'): void {
    if (typeof value !== 'number' || isNaN(value) || value < 0.0 || value > 1.0) {
      throw new PipelineError(
        PipelineErrorCode.ValidationError,
        `Reward signal field "${fieldName}" out of bounds [0.0, 1.0]: got ${value}`
      );
    }
  }

  static validateSignal(signal: RewardSignal): void {
    if (!signal.jobId || !signal.candidateId) {
      throw new PipelineError(PipelineErrorCode.ValidationError, 'RewardSignal missing jobId or candidateId');
    }
    const { retentionProbability, viralityScore, pacingQuality } = signal.dimensions;
    this.validateBounds(retentionProbability, 'retentionProbability');
    this.validateBounds(viralityScore, 'viralityScore');
    this.validateBounds(pacingQuality, 'pacingQuality');
    this.validateBounds(signal.compositeReward, 'compositeReward');
  }
}
