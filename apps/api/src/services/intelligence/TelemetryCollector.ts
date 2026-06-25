import { supabase } from '../supabaseService';
import { ExperimentContext } from './PipelineContext';

export interface FeatureVector {
  hook_score: number;
  context_score: number;
  emotion_score: number;
  curiosity_score: number;
  visual_score: number;
  pacing_metric: number;
  caption_density: number;
}

export interface RenderTelemetry {
  clipId: string;
  jobId: string;
  experiment: ExperimentContext;
  features: FeatureVector;
}

export interface WatchTelemetry {
  clipId: string;
  watchTimeSec: number;
  completionRate: number;
  liked: boolean;
  shared: boolean;
  replayed: boolean;
}

export interface ArenaMatch {
  storyId: string;
  candidateAId: string;
  candidateBId: string;
  winner: string; // ID or 'tie'
  userId?: string;
}

export class TelemetryCollector {
  
  /**
   * Logs the initial generation features of a clip before it is ever watched.
   * This builds the dataset of what was created.
   */
  public async logGenerationFeatures(telemetry: RenderTelemetry): Promise<void> {
    const db = supabase();
    
    await db.from('reward_features').insert({
      clip_id: telemetry.clipId,
      job_id: telemetry.jobId,
      story_builder_version: telemetry.experiment.storyBuilderVersion,
      critic_version: telemetry.experiment.criticVersion,
      ranking_version: telemetry.experiment.rankingVersion,
      hook_score: telemetry.features.hook_score,
      context_score: telemetry.features.context_score,
      emotion_score: telemetry.features.emotion_score,
      curiosity_score: telemetry.features.curiosity_score,
      visual_score: telemetry.features.visual_score,
      pacing_metric: telemetry.features.pacing_metric,
      caption_density: telemetry.features.caption_density
    });
  }

  /**
   * Updates an existing feature row with live watch telemetry.
   */
  public async logWatchTelemetry(telemetry: WatchTelemetry): Promise<void> {
    const db = supabase();
    
    await db.from('reward_features').update({
      watch_time_sec: telemetry.watchTimeSec,
      completion_rate: telemetry.completionRate,
      liked: telemetry.liked,
      shared: telemetry.shared,
      replayed: telemetry.replayed
    }).eq('clip_id', telemetry.clipId);
  }

  /**
   * Records an isolated Arena match to train the Reward Model offline.
   */
  public async recordArenaMatch(match: ArenaMatch): Promise<void> {
    const db = supabase();
    
    await db.from('arena_matches').insert({
      story_id: match.storyId,
      candidate_a_id: match.candidateAId,
      candidate_b_id: match.candidateBId,
      winner: match.winner,
      user_id: match.userId
    });
  }
}

export const telemetryCollector = new TelemetryCollector();
