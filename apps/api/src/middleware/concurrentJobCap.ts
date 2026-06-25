import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabaseService';

export const concurrentJobCap = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: User not found in request' });
  }

  try {
    const client = supabase();
    
    // Check how many active/queued jobs this user has
    // We assume the jobs table has a 'user_id' column, or it maps via an authenticated insert payload.
    // If user_id is not explicitly present, this query will fail or we can filter by payload->userId
    // Let's assume user_id is a column or payload contains userId. We'll check via payload->>userId to be safe if no column.
    
    // We'll try to check by user_id column first. 
    // In many Supabase setups, user_id is linked to auth.users.
    
    // Active statuses in Excerpt:
    const activeStatuses = ['queued', 'processing', 'retrying', 'transcribing', 'detecting_clips', 'recovering', 'cutting', 'captioning'];
    
    const { count, error } = await client
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .in('status', activeStatuses)
      // Check if user_id exists in schema. If not, this might need adjustment.
      // Excerpt's typical schema uses payload->>user_id if not a top-level column,
      // but we will assume user_id is a top level column for a standard multi-tenant setup.
      // Or we can fall back to checking the payload json.
      .eq('user_id', userId);

    // If there is an error (e.g. column user_id doesn't exist), we will try the payload fallback
    if (error && error.code === '42703') { // undefined_column
        const { count: payloadCount, error: payloadError } = await client
            .from('jobs')
            .select('*', { count: 'exact', head: true })
            .in('status', activeStatuses)
            .eq('payload->>user_id', userId);
            
        if (payloadError) throw payloadError;
        if ((payloadCount || 0) >= 3) {
            return res.status(429).json({ 
              error: 'Concurrency limit reached: You can only have 3 active/waiting jobs at a time.' 
            });
        }
    } else if (error) {
        throw error;
    } else {
        if ((count || 0) >= 3) {
            return res.status(429).json({ 
              error: 'Concurrency limit reached: You can only have 3 active/waiting jobs at a time.' 
            });
        }
    }

    next();
  } catch (error) {
    console.error('[ConcurrencyCap] Error checking concurrent jobs:', error);
    return res.status(500).json({ error: 'Internal server error while checking queue' });
  }
};
