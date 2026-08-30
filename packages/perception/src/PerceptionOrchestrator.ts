import { MediaArtifact, PerceptionResult, PipelineError, PipelineErrorCode, TemporalPerceptionStream } from '@excerpt/clipping-core';
import { CostLedger, Logger } from '@excerpt/shared';
import { PerceptionCache } from './cache/PerceptionCache';
import { TemporalAligner } from './alignment/TemporalAligner';
import { WhisperXEngine, PyannoteEngine, YOLOEngine } from './engines/MockEngines';

export class PerceptionOrchestrator {
  private cache: PerceptionCache;
  private whisper: WhisperXEngine;
  private pyannote: PyannoteEngine;
  private yolo: YOLOEngine;

  constructor(private logger: Logger, private costLedger: CostLedger, cacheDirectory: string) {
    this.cache = new PerceptionCache(cacheDirectory);
    this.whisper = new WhisperXEngine(logger, costLedger);
    this.pyannote = new PyannoteEngine(logger, costLedger);
    this.yolo = new YOLOEngine(logger, costLedger);
  }

  async init() {
    await this.cache.init();
  }

  async process(artifact: MediaArtifact): Promise<PerceptionResult> {
    const config = { timeoutMs: 30000 };
    
    // Arrays for alignment
    let whisperData: any[] | null = null;
    let pyannoteData: any[] | null = null;
    let yoloData: any[] | null = null;

    let completeness = 1.0;
    const optionalWeight = 0.33; // YOLO represents 33% of optional completeness for this mock

    // 1. Run WhisperX (Mandatory)
    try {
      whisperData = await this.runWithCache(this.whisper, artifact, config);
    } catch (e: any) {
       if (e instanceof PipelineError || e?.code === PipelineErrorCode.BudgetExceeded || e?.code === 'BUDGET_EXCEEDED') throw e;
       throw new PipelineError(PipelineErrorCode.PerceptionEngineFailed, `WhisperX failed: ${e.message}`);
    }

    // 2. Run Pyannote (Mandatory)
    try {
      pyannoteData = await this.runWithCache(this.pyannote, artifact, config);
    } catch (e: any) {
       if (e instanceof PipelineError || e?.code === PipelineErrorCode.BudgetExceeded || e?.code === 'BUDGET_EXCEEDED') throw e;
       throw new PipelineError(PipelineErrorCode.PerceptionEngineFailed, `Pyannote failed: ${e.message}`);
    }

    // 3. Run YOLO (Optional)
    try {
      yoloData = await this.runWithCache(this.yolo, artifact, config);
    } catch (e: any) {
       this.logger.warn(`YOLO engine failed (Optional), reducing completeness. Reason: ${e.message}`);
       completeness -= optionalWeight;
    }

    // 4. Temporal Alignment
    const stream = TemporalAligner.align(
      artifact.durationMs,
      whisperData,
      pyannoteData,
      yoloData,
      100 // 10hz alignment
    );

    return {
      stream,
      completeness: Math.max(0, completeness)
    };
  }

  private async runWithCache(engine: any, artifact: MediaArtifact, config: any): Promise<any> {
    const cacheKey = this.cache.generateKey(artifact.checksumSha256, engine.engineName, engine.engineVersion, config);
    
    const cachedData = await this.cache.get(cacheKey);
    if (cachedData) {
      this.logger.info(`Cache hit for ${engine.engineName}@${engine.engineVersion}`);
      return cachedData;
    }

    this.logger.info(`Cache miss for ${engine.engineName}@${engine.engineVersion}, running inference...`);
    const result = await engine.run(artifact, { ...config, engineName: engine.engineName, engineVersion: engine.engineVersion });
    
    await this.cache.set(cacheKey, result);
    return result;
  }
}
