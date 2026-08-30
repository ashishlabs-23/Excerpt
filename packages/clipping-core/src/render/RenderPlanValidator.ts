import { RenderPlan } from './types';
import { PipelineError, PipelineErrorCode } from '../errors/PipelineError';

export class RenderPlanValidator {
  /**
   * Validates a RenderPlan strictly before enqueueing.
   */
  static validate(plan: Partial<RenderPlan>): void {
    const requiredFields: (keyof RenderPlan)[] = [
      'jobId', 'schemaVersion', 'candidateId', 'sourceArtifact', 'duration',
      'cameraPlan', 'captionPlan', 'audioPlan', 'thumbnailPlan',
      'expectedArtifacts', 'deliveryPolicy', 'renderJobs', 'planHash'
    ];

    for (const field of requiredFields) {
      if (plan[field] === undefined || plan[field] === null) {
        throw new PipelineError(
          PipelineErrorCode.RenderPlanInvalid,
          `RenderPlan missing required field: ${field}`
        );
      }
    }

    // Version Bump Test logic hook.
    // In a real system, we'd compare schemaVersion against the expected interface shape.
    if (plan.schemaVersion !== '1.0.0') {
      throw new PipelineError(
        PipelineErrorCode.RenderPlanInvalid,
        `RenderPlan unsupported schemaVersion: ${plan.schemaVersion}`
      );
    }
  }
}
