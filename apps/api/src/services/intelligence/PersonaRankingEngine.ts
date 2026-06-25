import { StoryArc, CandidateRange } from './StoryGraph';
import { supabase } from '../supabaseService';

export type PlatformPersona = 'TikTok' | 'YouTubeShorts' | 'InstagramReels' | 'Default';

export interface RankedCandidate {
  candidate: CandidateRange;
  story: StoryArc;
  finalScore: number;
  persona: PlatformPersona;
}

export class PersonaRankingEngine {
  
  /**
   * Ranks all generated candidates based on a specific platform persona and user preferences.
   */
  public async rank(stories: StoryArc[], persona: PlatformPersona = 'Default', userId?: string): Promise<RankedCandidate[]> {
    const ranked: RankedCandidate[] = [];

    const weights = await this.getWeights(persona, userId);

    for (const story of stories) {
      for (const candidate of story.candidate_ranges) {
        // Base score from story
        const { hook, context, emotion, curiosity, resolution, visual, audio, retention, shareability } = story.scores;

        // Apply platform weights
        let finalScore = 
          (hook * weights.hook) +
          (context * weights.context) +
          (emotion * weights.emotion) +
          (curiosity * weights.curiosity) +
          (resolution * weights.resolution) +
          (visual * weights.visual) +
          (audio * weights.audio) +
          (retention * weights.retention) +
          (shareability * weights.shareability);

        // Normalize back to 100
        finalScore = Math.min(100, Math.max(0, finalScore));

        ranked.push({
          candidate,
          story,
          finalScore: Number(finalScore.toFixed(1)),
          persona
        });
      }
    }

    // Sort descending by score
    return ranked.sort((a, b) => b.finalScore - a.finalScore);
  }

  private async getWeights(persona: PlatformPersona, userId?: string) {
    let baseWeights: any;
    
    switch (persona) {
      case 'TikTok':
        return {
          hook: 0.30,       // Very high hook importance
          context: 0.05,
          emotion: 0.20,
          curiosity: 0.15,
          resolution: 0.05,
          visual: 0.10,
          audio: 0.05,
          retention: 0.10,
          shareability: 0.0
        };
      case 'YouTubeShorts':
        return {
          hook: 0.15,
          context: 0.10,
          emotion: 0.15,
          curiosity: 0.10,
          resolution: 0.20, // High resolution/satisfaction importance
          visual: 0.10,
          audio: 0.05,
          retention: 0.15,
          shareability: 0.0
        };
      case 'InstagramReels':
        return {
          hook: 0.20,
          context: 0.05,
          emotion: 0.10,
          curiosity: 0.10,
          resolution: 0.05,
          visual: 0.30,     // High visual aesthetic importance
          audio: 0.10,
          retention: 0.10,
          shareability: 0.0
        };
      default:
        // Balanced
        baseWeights = {
          hook: 0.15,
          context: 0.10,
          emotion: 0.15,
          curiosity: 0.10,
          resolution: 0.10,
          visual: 0.15,
          audio: 0.05,
          retention: 0.10,
          shareability: 0.10
        };
        break;
    }

    if (!userId) return baseWeights;

    try {
      const db = supabase();
      // Pull the cleanly validated embedding from the Offline Trainer
      const { data, error } = await db.from('user_embeddings').select('preference_vector').eq('user_id', userId).single();
      
      if (!error && data && data.preference_vector && Array.isArray(data.preference_vector)) {
        // Mock translation of the 5D embedding back to persona weights
        // In reality, this vector would feed into a neural ranking layer.
        const [h, c, e, cur, v] = data.preference_vector;
        
        baseWeights.hook = h;
        baseWeights.context = c;
        baseWeights.emotion = e;
        baseWeights.curiosity = cur;
        baseWeights.visual = v;
        // The remaining weights stay default for this simple mock
      }
    } catch (e) {
      console.error('[PersonaRankingEngine] Failed to fetch user embeddings:', e);
    }

    return baseWeights;
  }
}
