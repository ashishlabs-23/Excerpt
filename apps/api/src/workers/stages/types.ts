export interface StageResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  durationMs?: number;
}

export interface PipelineStage<TContext = any, TOutput = any> {
  readonly name: string;
  execute(context: TContext): Promise<StageResult<TOutput>>;
}
