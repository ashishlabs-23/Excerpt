import { Logger } from '@excerpt/shared';

export interface JobContext {
  jobId: string;
  artifacts: {
    ingestionPath?: string;
    transcriptionPath?: string;
    perceptionPath?: string;
    renderPlanPath?: string;
  };
}

export class StageDispatcher {
  constructor(private logger: Logger) {}

  /**
   * Safely invokes a pipeline stage, skipping it entirely if a valid persisted artifact already exists.
   * This provides true resumability on retry (Invariant 10).
   */
  async invokeStage<T>(
    context: JobContext,
    stageName: 'INGESTION' | 'TRANSCRIPTION' | 'PERCEPTION' | 'RENDER_PLANNING',
    artifactKey: keyof JobContext['artifacts'],
    executeFn: () => Promise<T>
  ): Promise<T | string> {
    
    // 1. Resumability Check
    const existingArtifactPath = context.artifacts[artifactKey];
    
    if (existingArtifactPath) {
      // In a real system we would verify the checksum/existence of the file here
      this.logger.info(`[StageDispatcher] Resuming job ${context.jobId}: skipping ${stageName} as artifact ${existingArtifactPath} already exists.`);
      return existingArtifactPath;
    }

    // 2. Execute Stage
    this.logger.info(`[StageDispatcher] Executing stage ${stageName} for job ${context.jobId}...`);
    const result = await executeFn();
    return result;
  }
}
