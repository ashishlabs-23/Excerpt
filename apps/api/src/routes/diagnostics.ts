import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/supabaseService';
import { adminAuth } from '../middleware/adminAuth';

const router = Router();
const db = new DatabaseService();

router.use(adminAuth);

router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const { data, error } = await db.getSupabase()
      .from('jobs')
      .select('id, user_id, youtube_url, status, progress, created_at, updated_at, failed_reason, debug_data, performance_metrics, worker_id')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json({ jobs: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/workers', async (req: Request, res: Response) => {
  // Use the internal health endpoints or manager to get worker stats
  // For now, we return mock health as we haven't exposed IPC to workers
  res.json({
    workers: [
      { name: 'VideoWorker', status: 'Running', uptime: process.uptime() },
      { name: 'RenderWorker', status: 'Running', uptime: process.uptime() },
    ]
  });
});

export default router;
