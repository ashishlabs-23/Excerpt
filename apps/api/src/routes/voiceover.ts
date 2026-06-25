import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/supabaseService';
import { requireUserJWT } from '../middleware/supabaseAuth';
import { denyUnlessOwner, getClipOwnerId } from '../middleware/ownership';
import { verifyUploadedMedia } from '../validation/fileValidation';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();
const db = new DatabaseService();

// GET /api/voiceover/project/:id
router.get('/project/:id', requireUserJWT, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const project = await db.getVoiceoverProject(projectId);
    
    if (!denyUnlessOwner(project.user_id, req.user.id, res, 'voiceover project')) {
      return;
    }
    
    res.json(project);
  } catch (error: any) {
    console.error('[Voiceover API]: Error fetching project:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/voiceover/projects
router.get('/projects', requireUserJWT, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const projects = await db.getVoiceoverProjectsByUser(userId);
    res.json(projects);
  } catch (error: any) {
    console.error('[Voiceover API]: Error fetching projects:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/voiceover/project
router.post('/project', requireUserJWT, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { sourceUrl, title, sourceDuration } = req.body;
    if (!sourceUrl) return res.status(400).json({ error: 'sourceUrl is required' });

    const projectData = {
      user_id: userId,
      source_url: sourceUrl,
      title: title || 'Untitled Voiceover',
      source_duration: sourceDuration || null,
      status: 'draft',
    };

    const project = await db.createVoiceoverProject(projectData);
    res.status(201).json(project);
  } catch (error: any) {
    console.error('[Voiceover API]: Error creating project:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/voiceover/project/:id/segments
router.put('/project/:id/segments', requireUserJWT, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const userId = req.user?.id;
    const segments = req.body.segments;

    if (!Array.isArray(segments)) return res.status(400).json({ error: 'segments must be an array' });

    // Verify ownership
    const project = await db.getVoiceoverProject(projectId);
    if (!denyUnlessOwner(project.user_id, userId, res, 'voiceover project')) {
      return;
    }

    const segmentsData = segments.map((seg: any) => ({
      id: seg.id || crypto.randomUUID(),
      project_id: projectId,
      user_id: userId,
      start_time: seg.start_time,
      end_time: seg.end_time,
      narration_text: seg.narration_text,
      clip_type: seg.clip_type || 'narration',
      status: 'pending',
    }));

    const saved = await db.saveVoiceoverSegments(segmentsData);
    res.json(saved);
  } catch (error: any) {
    console.error('[Voiceover API]: Error saving segments:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/voiceover/project/:id/render
router.post('/project/:id/render', requireUserJWT, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id as string;
    const userId = req.user?.id;
    const voiceConfig = req.body.voiceConfig || {};

    const project = await db.getVoiceoverProject(projectId);
    if (!denyUnlessOwner(project.user_id, userId, res, 'voiceover project')) {
      return;
    }

    // Queue job in the main jobs table, but set job_type to 'voiceover'
    const jobId = crypto.randomUUID();
    await db.createJob({
      id: jobId,
      user_id: userId,
      video_url: project.source_url,
      job_type: 'voiceover',
      status: 'queued',
      progress: 0,
      payload: {
        voiceover_project_id: projectId,
        voice_config: voiceConfig,
        title: project.title,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    // Update project status
    await db.updateVoiceoverProject(projectId, { status: 'processing', source_job_id: jobId });

    res.status(202).json({ jobId, message: 'Voiceover render job queued' });
  } catch (error: any) {
    console.error('[Voiceover API]: Error queueing render:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/voiceover/voices
router.get('/voices', requireUserJWT, async (req: Request, res: Response) => {
  try {
    // Dynamic import to avoid circular dependency / early instantiation issues
    const { VoiceoverService } = await import('../services/VoiceoverService');
    const service = VoiceoverService.getInstance();
    
    const provider = (req.query.provider as string) || process.env.VOICEOVER_PRIMARY_PROVIDER || 'google';
    const voices = await service.getAvailableVoices(provider as any);
    
    res.json(voices);
  } catch (error: any) {
    console.error('[Voiceover API]: Error fetching voices:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Configure Multer for audio uploads (microphone / local audio files)
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'temp', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'voice-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for audio
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('audio/')) {
      cb(new Error('Only audio uploads are supported.'));
      return;
    }
    cb(null, true);
  }
});

// POST /api/voiceover/voice/clone
router.post('/voice/clone', requireUserJWT, uploadAudio.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }

  const filePath = req.file.path;
  const name = req.body.name || 'Cloned Voice';
  const description = req.body.description || 'Voice cloned in Excerpt Studio';

  try {
    // 1. Magic bytes and integrity verification
    const verification = await verifyUploadedMedia(filePath, 'audio');
    if (!verification.valid) {
      console.warn(`[Voiceover API]: Cloned voice audio verification failed: ${verification.error}`);
      try { fs.unlinkSync(filePath); } catch {}
      return res.status(400).json({ error: verification.error || 'Invalid audio file format' });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY is not configured on the server.');
    }

    // 2. Prepare Form Data for ElevenLabs
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    
    const fileBuffer = fs.readFileSync(filePath);
    const fileBlob = new Blob([fileBuffer], { type: req.file.mimetype });
    formData.append('files', fileBlob, req.file.originalname);

    console.log(`[Voiceover API]: Sending voice clone request to ElevenLabs: "${name}"`);
    
    // 3. Post to ElevenLabs
    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey
      },
      body: formData as any
    });

    try { fs.unlinkSync(filePath); } catch {}

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Voiceover API]: ElevenLabs add voice failed:`, errText);
      return res.status(response.status).json({ error: `ElevenLabs failed: ${errText}` });
    }

    const result = await response.json() as { voice_id: string };
    console.log(`[Voiceover API]: Voice cloned successfully. ID: ${result.voice_id}`);
    
    return res.status(201).json({
      voiceId: result.voice_id,
      name,
      message: 'Voice cloned successfully'
    });

  } catch (error: any) {
    console.error('[Voiceover API]: Voice clone error:', error);
    try { fs.unlinkSync(filePath); } catch {}
    return res.status(500).json({ error: error.message || 'Internal server error during voice cloning.' });
  }
});

// ============================================================================
// NEW DECOUPLED ARCHITECTURE: Derived Voiceover Clips
// ============================================================================

// POST /api/voiceover/clip/:clipId
router.post('/clip/:clipId', requireUserJWT, async (req: Request, res: Response) => {
  try {
    const clipId = req.params.clipId as string;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { provider, voice, narrationText, scriptMode } = req.body;
    if (!provider || !voice || !narrationText) {
      return res.status(400).json({ error: 'provider, voice, and narrationText are required' });
    }

    // Verify clip ownership
    const clip = await db.getClip(clipId);
    if (!clip || !denyUnlessOwner(getClipOwnerId(clip), userId, res, 'clip')) {
       return;
    }

    const vcData = {
      source_clip_id: clipId,
      user_id: userId,
      provider,
      voice,
      narration_text: narrationText,
      status: 'pending',
      script_mode: scriptMode || 'custom',
      metadata: {
        style: req.body.style,
        language: req.body.language
      }
    };

    const voiceoverClip = await db.createVoiceoverClip(vcData);
    res.status(201).json(voiceoverClip);
  } catch (error: any) {
    console.error('[Voiceover API]: Error creating voiceover clip:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/voiceover/generate-script
router.post('/generate-script', requireUserJWT, async (req: Request, res: Response) => {
  try {
    const { style, language, contextText, customInstruction } = req.body;
    if (!style || !language) {
      return res.status(400).json({ error: 'style and language are required' });
    }

    const { ScriptGenerationService } = await import('../services/ScriptGenerationService');
    const service = ScriptGenerationService.getInstance();
    const script = await service.generateScript(style, language, contextText, customInstruction);
    res.json({ script });
  } catch (error: any) {
    console.error('[Voiceover API]: Error generating script:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/voiceover/clip/:clipId
router.get('/clip/:clipId', requireUserJWT, async (req: Request, res: Response) => {
  try {
    const clipId = req.params.clipId as string;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const voiceovers = await db.getVoiceoverClipsBySource(clipId);
    res.json(voiceovers);
  } catch (error: any) {
    console.error('[Voiceover API]: Error fetching voiceovers:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/voiceover/all
router.get('/all', requireUserJWT, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const voiceovers = await db.getAllVoiceoverClipsByUser(userId);
    res.json(voiceovers);
  } catch (error: any) {
    console.error('[Voiceover API]: Error fetching all voiceovers:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/voiceover/:id/like
router.post('/:id/like', requireUserJWT, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await db.getSupabase()
      .from('voiceover_feedback')
      .upsert({ voiceover_id: id, liked: true, disliked: false }, { onConflict: 'voiceover_id' })
      .select();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('[Voiceover API]: Error liking voiceover:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/voiceover/:id/dislike
router.post('/:id/dislike', requireUserJWT, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await db.getSupabase()
      .from('voiceover_feedback')
      .upsert({ voiceover_id: id, liked: false, disliked: true }, { onConflict: 'voiceover_id' })
      .select();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('[Voiceover API]: Error disliking voiceover:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/voiceover/:id/play
router.post('/:id/play', requireUserJWT, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data: existing } = await db.getSupabase()
      .from('voiceover_feedback')
      .select('play_count')
      .eq('voiceover_id', id)
      .maybeSingle();

    const newPlayCount = (existing?.play_count || 0) + 1;
    const { data, error } = await db.getSupabase()
      .from('voiceover_feedback')
      .upsert({ voiceover_id: id, play_count: newPlayCount }, { onConflict: 'voiceover_id' })
      .select();
    if (error) throw error;
    res.json({ success: true, play_count: newPlayCount });
  } catch (error: any) {
    console.error('[Voiceover API]: Error incrementing play count:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
