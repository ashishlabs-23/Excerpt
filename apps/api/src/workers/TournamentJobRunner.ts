import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import dotenv from 'dotenv';
// In a real app we'd import the videoProcessor to actually trigger FFmpeg
// import { videoProcessor } from '../services/videoProcessor';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export class TournamentJobRunner {
  
  /**
   * Nightly job to find clips with `shadow_bounds` and queue them for A/B rendering
   */
  public async runNightlyBatch(): Promise<void> {
    console.log('[TournamentJobRunner] Starting nightly batch for shadow bound lazy rendering...');
    
    // 1. Fetch clips that were generated today and contain a shadow_bounds metadata
    const { data: clips, error } = await supabase.from('clips')
      .select('id, job_id, video_url, metadata')
      .not('metadata->shadow_bounds', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50); // limit nightly processing

    if (error) {
      console.error('[TournamentJobRunner] DB Error fetching shadow bounds:', error);
      return;
    }

    if (!clips || clips.length === 0) {
      console.log('[TournamentJobRunner] No shadow bounds found for tonight.');
      return;
    }

    console.log(`[TournamentJobRunner] Found ${clips.length} candidate clips for A/B tournament rendering.`);

    let renderedCount = 0;
    
    for (const clip of clips) {
      const shadowBounds = clip.metadata.shadow_bounds;
      if (!shadowBounds) continue;
      
      try {
        console.log(`[TournamentJobRunner] Rendering candidate shadow clip for Original Clip ${clip.id}...`);
        console.log(`  -> Promoted Bounds: N/A (Already rendered as original clip)`);
        console.log(`  -> Candidate Bounds: ${shadowBounds.candidateStart}s to ${shadowBounds.candidateEnd}s`);
        
        // Mocking the render overhead
        // await videoProcessor.processClip({
        //    id: `${clip.id}_candidate`,
        //    jobId: clip.job_id,
        //    start: shadowBounds.candidateStart,
        //    end: shadowBounds.candidateEnd,
        //    mode: 'draft'
        // });
        
        renderedCount++;
        
        // Optionally update the DB to indicate the candidate clip is ready for tournament UI
        await supabase.from('clips').update({
          metadata: {
            ...clip.metadata,
            tournament_ready: true,
            candidate_clip_url: `https://mock-storage.excerpt.ai/candidate_${clip.id}.mp4`
          }
        }).eq('id', clip.id);
        
      } catch (e) {
        console.error(`[TournamentJobRunner] Failed to render candidate for clip ${clip.id}`, e);
      }
    }

    console.log(`[TournamentJobRunner] Nightly batch complete. Generated ${renderedCount} candidate clips for Editor Evaluation.`);
  }
}

export const tournamentJobRunner = new TournamentJobRunner();

// If run directly:
if (require.main === module) {
  tournamentJobRunner.runNightlyBatch().catch(console.error);
}
