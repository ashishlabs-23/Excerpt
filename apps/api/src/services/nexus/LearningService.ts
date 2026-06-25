import { NEXUS_FEATURES } from '../../config/features';
import { NexusResult } from './NexusRegistry';
import { callOllamaRaw } from '../ollamaService';
import { DatabaseService } from '../supabaseService';

export class LearningService {
  private static instance: LearningService;
  private db: DatabaseService;

  private constructor() {
    this.db = new DatabaseService();
  }

  public static getInstance(): LearningService {
    if (!LearningService.instance) {
      LearningService.instance = new LearningService();
    }
    return LearningService.instance;
  }

  /**
   * Logs a Nexus analysis result for future training/correlation.
   */
  public async logResult(
    jobId: string,
    clipId: string,
    originalScore: number,
    nexusResult: NexusResult
  ) {
    if (!NEXUS_FEATURES.learning_module) return;

    try {
      await this.db.saveNexusSignal({
        job_id: jobId,
        clip_id: clipId,
        original_score: originalScore,
        nexus_offset: nexusResult.finalScoreOffset,
        final_score: originalScore + nexusResult.finalScoreOffset,
        audio_score: nexusResult.signals.audio?.score || null,
        face_score: nexusResult.signals.face?.score || null,
        visual_score: nexusResult.signals.visual?.score || null,
        metadata: nexusResult.metadata || {}
      });
    } catch (e) {
      console.error('[Nexus] Failed to log signal to Supabase:', e);
    }
  }

  public async getCachedEnhancement(hash: string): Promise<any | null> {
    try {
      return await this.db.getClipEnhancement(hash);
    } catch (e) {
      return null;
    }
  }

  public async setCachedEnhancement(hash: string, data: any) {
    try {
      await this.db.saveClipEnhancement({
        transcript_hash: hash,
        hook: data.hook,
        title: data.title,
        description: data.description,
        keywords: data.keywords
      });
    } catch (e) {
      console.error('[Nexus] Failed to cache enhancement in Supabase:', e);
    }
  }

  /**
   * Stage 12: Learning Analysis (Thinking Step)
   * Uses Ollama to analyze the last 10 processed signals for viral pattern detection.
   */
  public async analyzePatternsWithOllama(): Promise<string> {
    if (!NEXUS_FEATURES.learning_module) return 'Learning disabled.';
    
    try {
      const lastSignals = await this.db.getLatestNexusSignals(10);

      if (!lastSignals || lastSignals.length === 0) return 'Insufficient data for analysis.';

      const systemPrompt = "You are a Viral Content Analyst. Analyze the following clip performance metrics and provide 3 'Viral Velocity Tips' for the next batch.";
      const userPrompt = `Last 10 Signals: ${JSON.stringify(lastSignals)}`;

      const analysis =
        (await callOllamaRaw({
          systemPrompt,
          userPrompt,
          retries: 2,
          timeoutMs: 45000,
          cacheKey: `learning:${lastSignals.length}:${JSON.stringify(lastSignals)}`,
        })) || 'Analysis skipped.';
      
      console.log('[Nexus] Stage 12 Learning Analysis Complete.');
      return analysis;
    } catch (e) {
      console.error('[Nexus] Cloud Pattern Analysis failed:', e);
      return 'Analysis skipped.';
    }
  }
}
