import { PipelineContext } from './PipelineContext';
import { supabase } from '../supabaseService';
import { StoryGraph } from './StoryGraph';

export class DatabasePersistenceEngine {
  /**
   * Saves intelligence artifacts (narratives, emotion, tension, graphs) to the database asynchronously.
   * This is a fire-and-forget operation to prevent blocking video processing.
   */
  public async saveIntelligence(context: PipelineContext, graph: StoryGraph, jobId: string): Promise<void> {
    if (!jobId) {
       console.warn('[DatabasePersistenceEngine] No jobId provided. Skipping persistence.');
       return;
    }

    const db = supabase();

    try {
      // 1. Save Narratives
      if (context.topNarratives && context.topNarratives.length > 0) {
         const narrativeRecords = context.topNarratives.map(n => ({
            job_id: jobId,
            situation_id: n.situationId,
            narrative_type: n.type,
            narrative_strength: n.narrativeStrength,
            publishability_score: n.publishabilityScore || 0,
            confidence: n.confidence
         }));
         db.from('narratives').insert(narrativeRecords).then(({ error }) => {
            if (error) console.error('[DatabasePersistenceEngine] Failed to save narratives:', error);
         });
      }

      // 2. Save Emotion and Tension Profiles
      if (context.situations && context.situations.length > 0) {
         const emotionRecords: any[] = [];
         const tensionRecords: any[] = [];

         context.situations.forEach(sit => {
            if (sit.emotion) {
               emotionRecords.push({
                  job_id: jobId,
                  situation_id: sit.id,
                  crowd_eruption: sit.emotion.crowdEruption,
                  commentator_excitement: sit.emotion.commentatorExcitement,
                  player_celebration: sit.emotion.playerCelebration,
                  bench_reaction: sit.emotion.benchReaction,
                  manager_reaction: sit.emotion.managerReaction,
                  emotion_score: sit.emotion.emotionScore
               });
            }
            if (sit.tension) {
               tensionRecords.push({
                  job_id: jobId,
                  situation_id: sit.id,
                  start_tension: sit.tension.startTension,
                  peak_tension: sit.tension.peakTension,
                  growth_rate: sit.tension.growthRate,
                  tension_area: sit.tension.tensionArea
               });
            }
         });

         if (emotionRecords.length > 0) {
            db.from('emotion_profiles').insert(emotionRecords).then(({ error }) => {
               if (error) console.error('[DatabasePersistenceEngine] Failed to save emotion profiles:', error);
            });
         }
         
         if (tensionRecords.length > 0) {
            db.from('tension_profiles').insert(tensionRecords).then(({ error }) => {
               if (error) console.error('[DatabasePersistenceEngine] Failed to save tension profiles:', error);
            });
         }
      }

      // 3. Save Story Graph
      if (graph && 'nodes' in graph) { // Legacy compatibility
         const legacyGraph = graph as any;
         const nodes = Array.from(legacyGraph.nodes.values());
         db.from('story_graphs').insert({
            job_id: jobId,
            nodes: JSON.stringify(nodes),
            edges: JSON.stringify(legacyGraph.edges)
         }).then(({ error }) => {
            if (error) console.error('[DatabasePersistenceEngine] Failed to save story graph:', error);
         });
      }

    } catch (err) {
      console.error('[DatabasePersistenceEngine] Unhandled error during persistence:', err);
    }
  }
}

export const databasePersistenceEngine = new DatabasePersistenceEngine();
