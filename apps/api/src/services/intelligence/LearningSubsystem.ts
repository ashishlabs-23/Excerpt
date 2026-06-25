import fs from 'fs';
import path from 'path';
import { PipelineContext } from './PipelineContext';
import { DatabaseService } from '../supabaseService';

export class LearningSubsystem {
  private db: DatabaseService;
  private logPath: string;

  constructor() {
    this.db = new DatabaseService();
    this.logPath = path.join(process.cwd(), 'temp', 'v3_learning_telemetry.json');
    const dir = path.dirname(this.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public async logTelemetry(
    jobId: string,
    clipId: string,
    clipScore: number,
    rankingReason: string,
    context: PipelineContext
  ) {
    const start = Date.now();

    const viralPattern = context.viralPatterns?.[clipId];
    const retention = context.retention?.[clipId];
    const satisfaction = context.satisfaction?.[clipId];

    const telemetryPayload = {
      timestamp: new Date().toISOString(),
      job_id: jobId,
      clip_id: clipId,
      clip_score: clipScore,
      ranking_reason: rankingReason,
      viral_pattern: viralPattern?.pattern ?? 'unknown',
      pattern_confidence: viralPattern?.confidence ?? 0,
      historical_performance: viralPattern?.historical_performance ?? 0,
      retention_score: retention?.retention_score ?? 0,
      expected_completion_rate: retention?.expected_completion_rate ?? 0,
      expected_rewatch_rate: retention?.expected_rewatch_rate ?? 0,
      satisfaction_score: satisfaction?.satisfaction_score ?? 0,
      // Placeholder fields for future real-world performance feedback integration
      future_metrics: {
        views: null,
        watch_time_sec: null,
        shares: null,
        saves: null
      }
    };

    // 1. Write to local telemetry file
    try {
      let currentLogs: any[] = [];
      if (fs.existsSync(this.logPath)) {
        try {
          currentLogs = JSON.parse(fs.readFileSync(this.logPath, 'utf8'));
        } catch {
          currentLogs = [];
        }
      }
      currentLogs.push(telemetryPayload);
      fs.writeFileSync(this.logPath, JSON.stringify(currentLogs, null, 2));
    } catch (err) {
      console.warn(`[LearningSubsystem]: Local telemetry log write failed:`, err);
    }

    // 2. Write to Supabase if connection is active and we have custom schema columns,
    // otherwise fallback gracefully to saving inside metadata
    try {
      await this.db.saveNexusSignal({
        job_id: jobId,
        clip_id: clipId,
        original_score: clipScore,
        nexus_offset: 0,
        final_score: clipScore,
        audio_score: retention?.expected_completion_rate || null,
        face_score: retention?.expected_rewatch_rate || null,
        visual_score: satisfaction?.satisfaction_score || null,
        metadata: {
          v3_telemetry: telemetryPayload
        }
      });
    } catch (dbErr) {
      console.warn(`[LearningSubsystem]: Supabase telemetry logging skipped/failed:`, dbErr);
    }

    context.executionTimes['LearningSubsystem'] = Date.now() - start;
    console.log(`[LearningSubsystem]: Logged V3 telemetry payload for clip ${clipId}.`);
  }
}

export const learningSubsystem = new LearningSubsystem();
