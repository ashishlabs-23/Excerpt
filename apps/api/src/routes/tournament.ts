import { Router, Request, Response } from 'express';
import { requireUserJWT } from '../middleware/supabaseAuth';
import { supabase } from '../services/supabaseService';

const router = Router();

/**
 * @route   POST /api/tournament/log
 * @desc    Submit result of a blind A/B tournament
 */
router.post('/log', requireUserJWT, async (req: Request, res: Response) => {
  const { 
    clipId, 
    jobId, 
    narrativeType, 
    boundaryASource, 
    boundaryBSource, 
    winner, 
    confidence, 
    reason 
  } = req.body;
  
  if (!clipId || !winner) {
    return res.status(400).json({ error: 'clipId and winner are required.' });
  }

  const db = supabase();

  try {
    const { error } = await db.from('boundary_tournament').insert({
      clip_id: clipId,
      job_id: jobId,
      narrative_type: narrativeType || 'Unknown',
      boundary_a_source: boundaryASource,
      boundary_b_source: boundaryBSource,
      winner,
      confidence: Number(confidence) || 1.0,
      reason
    });

    if (error) {
      console.error('[TournamentRoute]: DB Error:', error);
      return res.status(500).json({ error: 'Failed to log tournament result' });
    }

    return res.status(201).json({ message: 'Tournament result logged successfully.' });
  } catch (error: any) {
    console.error(`[TournamentRoute]: Failed to log tournament:`, error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
