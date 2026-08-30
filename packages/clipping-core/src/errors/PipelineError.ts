export enum PipelineErrorCode {
  // Input validation & safety
  SsrfViolation = 'SSRF_VIOLATION',
  ResourceLimitExceeded = 'RESOURCE_LIMIT_EXCEEDED',
  BudgetExceeded = 'BUDGET_EXCEEDED',
  UnsupportedMediaType = 'UNSUPPORTED_MEDIA_TYPE',
  ValidationError = 'VALIDATION_ERROR',
  MinimumDurationNotMet = 'MINIMUM_DURATION_NOT_MET',
  PerceptionEngineFailed = 'PERCEPTION_ENGINE_FAILED',
  // Render Errors
  RenderPlanInvalid = 'RenderPlanInvalid',
  RenderPlanImmutable = 'RenderPlanImmutable',
  InsufficientStorage = 'InsufficientStorage',
  // Recovery Errors
  CircuitOpen = 'CircuitOpen',
  GraphConstructionFailed = 'GRAPH_CONSTRUCTION_FAILED',
  NoViableCandidates = 'NO_VIABLE_CANDIDATES',
  
  // Pipeline stages
  DownloadFailed = 'DOWNLOAD_FAILED',
  TranscriptionFailed = 'TRANSCRIPTION_FAILED',
  PerceptionFailed = 'PERCEPTION_FAILED',
  CandidateGenerationFailed = 'CANDIDATE_GENERATION_FAILED',
  RankingFailed = 'RANKING_FAILED',
  PlanningFailed = 'PLANNING_FAILED',
  RenderFailed = 'RENDER_FAILED',
  
  // Validation & Persistence
  DeliveryFailed = 'DELIVERY_FAILED',
  PlaybackValidationFailed = 'PLAYBACK_VALIDATION_FAILED',
  ArtifactUnusable = 'ARTIFACT_UNUSABLE',
  PersistenceFailed = 'PERSISTENCE_FAILED',
  
  // Logic
  NoViableClips = 'NO_VIABLE_CLIPS',
  Timeout = 'TIMEOUT'
}

export class PipelineError extends Error {
  public readonly code?: PipelineErrorCode | string;
  public readonly category?: any;
  public readonly retryable: boolean;
  public readonly stage?: string;
  public readonly component?: string;
  public readonly provider?: string;
  public readonly httpStatus?: number;
  public readonly exitCode?: number;
  public readonly requestId?: string;
  public readonly jobId?: string;
  public readonly clipId?: string;
  public readonly durationMs?: number;
  public readonly attempt?: number;
  public readonly rootCause?: string;
  public readonly timestamp: string;
  public readonly timeoutType?: string;
  public readonly metadata?: Record<string, any>;
  public readonly suggestedFix?: string;
  public readonly causeErr?: unknown;
  public readonly meta?: Record<string, unknown>;

  constructor(
    codeOrDetails:
      | PipelineErrorCode
      | string
      | {
          message: string;
          category?: any;
          retryable?: boolean;
          stage?: string;
          component?: string;
          provider?: string;
          httpStatus?: number;
          exitCode?: number;
          requestId?: string;
          jobId?: string;
          clipId?: string;
          durationMs?: number;
          attempt?: number;
          rootCause?: string;
          timeoutType?: any;
          metadata?: Record<string, any>;
          suggestedFix?: string;
          causeErr?: unknown;
          code?: PipelineErrorCode;
          meta?: Record<string, unknown>;
          [key: string]: any;
        },
    message?: string,
    meta?: Record<string, unknown>
  ) {
    if (typeof codeOrDetails === 'object' && codeOrDetails !== null) {
      super(codeOrDetails.message);
      this.category = codeOrDetails.category;
      this.retryable = codeOrDetails.retryable ?? false;
      this.stage = codeOrDetails.stage;
      this.component = codeOrDetails.component;
      this.provider = codeOrDetails.provider;
      this.httpStatus = codeOrDetails.httpStatus;
      this.exitCode = codeOrDetails.exitCode;
      this.requestId = codeOrDetails.requestId;
      this.jobId = codeOrDetails.jobId;
      this.clipId = codeOrDetails.clipId;
      this.durationMs = codeOrDetails.durationMs;
      this.attempt = codeOrDetails.attempt;
      this.rootCause = codeOrDetails.rootCause;
      this.timestamp = new Date().toISOString();
      this.timeoutType = codeOrDetails.timeoutType;
      this.metadata = codeOrDetails.metadata;
      this.suggestedFix = codeOrDetails.suggestedFix;
      this.causeErr = codeOrDetails.causeErr;
      this.code = codeOrDetails.code ?? (codeOrDetails.category as any);
      this.meta = codeOrDetails.meta ?? codeOrDetails;
    } else {
      super(message || String(codeOrDetails));
      this.code = codeOrDetails as any;
      this.retryable = false;
      this.timestamp = new Date().toISOString();
      this.meta = meta;
    }
    this.name = 'PipelineError';
    Object.setPrototypeOf(this, PipelineError.prototype);
  }

  public toJSON(): Record<string, any> {
    return {
      category: this.category,
      code: this.code,
      message: this.message,
      stage: this.stage,
      component: this.component,
      provider: this.provider,
      retryable: this.retryable,
      httpStatus: this.httpStatus,
      exitCode: this.exitCode,
      requestId: this.requestId,
      jobId: this.jobId,
      clipId: this.clipId,
      durationMs: this.durationMs,
      attempt: this.attempt,
      rootCause: this.rootCause,
      timestamp: this.timestamp,
      timeoutType: this.timeoutType,
      metadata: this.metadata,
      suggestedFix: this.suggestedFix,
      meta: this.meta
    };
  }
}
