import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * GET /api/system/arena/candidates
 * Fetches two diverse candidates from a random completed job to present to the human reviewer.
 * Note: A real implementation would fetch from a pending queue, but for now we'll mock the response.
 */
router.get('/candidates', async (req, res) => {
  // Return mock candidates for the arena UI
  res.json({
    job_id: 'mock-job-id',
    video_url: 'https://example.com/mock-video.mp4',
    candidateA: {
      id: 'cand_a_123',
      start_time: 15.0,
      end_time: 45.0,
      title: 'Candidate A Title',
      reason: ['Strong hook', 'Emotional peak']
    },
    candidateB: {
      id: 'cand_b_456',
      start_time: 15.5,
      end_time: 44.5,
      title: 'Candidate B Title',
      reason: ['Better payoff', 'Tighter edit']
    }
  });
});

/**
 * POST /api/system/arena/vote
 * Submits the human preference to the human_arena table.
 */
router.post('/vote', async (req, res) => {
  const { job_id, candidate_a_id, candidate_b_id, winner_id, time_taken_ms, reviewer } = req.body;
  
  if (!job_id || !candidate_a_id || !candidate_b_id || !winner_id) {
    return res.status(400).json({ error: 'Missing required arena fields.' });
  }

  const { error } = await supabase
    .from('human_arena')
    .insert({
      job_id,
      candidate_a_id,
      candidate_b_id,
      winner_id,
      time_taken_ms,
      reviewer: reviewer || 'anonymous'
    });

  if (error) {
    console.error('[ArenaRoute] Failed to record vote:', error);
    return res.status(500).json({ error: 'Failed to record vote' });
  }

  res.json({ success: true });
});

export default router;
