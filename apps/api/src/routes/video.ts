import { Router, Request, Response } from 'express';
import { queueService } from '../services/queueService';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { DatabaseService, supabase } from '../services/supabaseService';
import { VideoProcessor } from '../services/videoProcessor';
import { StorageService } from '../services/storageService';
import { assertSafeRemoteVideoUrl, fetchSecurely } from '../services/urlSafety';
import {
  jobSubmissionRateLimit,
  metadataLookupRateLimit,
  requireJobSubmissionAuth,
} from '../middleware/security';
import { requireUserJWT } from '../middleware/supabaseAuth';
import { denyUnlessOwner, getClipOwnerId } from '../middleware/ownership';
import { buildPlayUrl, createPlayToken, verifyPlayToken } from '../lib/playToken';
import { concurrentJobCap } from '../middleware/concurrentJobCap';
import { validateVideoUrlMiddleware } from '../middleware/validateVideoUrl';
import { verifyUploadedMedia } from '../validation/fileValidation';

const router = Router();
const purgeEnabled =
  process.env.ENABLE_PURGE_API === 'true' || process.env.NODE_ENV !== 'production';
const localClipsDir = path.join(process.cwd(), 'temp', 'clips');
const storageService = StorageService.getInstance();

// Configure Multer for local uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'temp', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB limit
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) {
      cb(new Error('Only video uploads are supported.'));
      return;
    }
    cb(null, true);
  }
});

function sanitizeDownloadFileName(value: string) {
  const normalized = value
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return normalized || 'excerpt-clip';
}

function getDownloadFileName(clipId: string, clip: any) {
  const candidateTitle =
    clip?.metadata?.title ||
    clip?.title ||
    `excerpt-clip-${clipId}`;

  return `${sanitizeDownloadFileName(candidateTitle)}.mp4`;
}

function getLocalClipRelativePath(videoUrl: string) {
  if (!videoUrl) return null;

  if (/^https?:\/\//i.test(videoUrl)) {
    try {
      const parsed = new URL(videoUrl);
      const isLoopbackHost =
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1';

      if (!isLoopbackHost || !parsed.pathname.startsWith('/clips/')) {
        return null;
      }

      return parsed.pathname.slice('/clips/'.length);
    } catch {
      return null;
    }
  }

  const normalized = videoUrl.replace(/\\/g, '/');

  if (normalized.startsWith('/clips/')) {
    return normalized.slice('/clips/'.length);
  }

  if (normalized.startsWith('clips/')) {
    return normalized.slice('clips/'.length);
  }

  return null;
}

function resolveLocalClipPath(videoUrl: string, jobId?: string, showCaptions = true) {
  let adjustedUrl = videoUrl;
  if (showCaptions) {
    adjustedUrl = videoUrl.replace('-clean.mp4', '.mp4');
  } else {
    if (!videoUrl.includes('-clean.mp4') && videoUrl.endsWith('.mp4')) {
      adjustedUrl = videoUrl.replace('.mp4', '-clean.mp4');
    }
  }

  const relativePath = getLocalClipRelativePath(adjustedUrl);
  if (!relativePath) return null;

  const segments = relativePath
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (segments.length === 0) return null;
  if (segments.some((segment) => (
    segment === '.' ||
    segment === '..' ||
    segment.includes('/') ||
    segment.includes('\\')
  ))) {
    return null;
  }

  const basePath = path.resolve(localClipsDir);
  
  // Try direct path first
  let resolvedPath = path.resolve(basePath, ...segments);

  // If jobId is provided and direct path doesn't exist, try jobId/clipId.mp4
  if (jobId && !fs.existsSync(resolvedPath)) {
    const fileName = segments[segments.length - 1];
    const jobSpecificPath = path.resolve(basePath, jobId, fileName);
    if (fs.existsSync(jobSpecificPath)) {
      resolvedPath = jobSpecificPath;
    }
  }

  if (resolvedPath !== basePath && !resolvedPath.startsWith(`${basePath}${path.sep}`)) {
    return null;
  }

  return resolvedPath;
}

function resolveRemoteClipUrl(videoUrl: string, req: Request) {
  if (!videoUrl) return null;

  if (/^https?:\/\//i.test(videoUrl)) {
    return videoUrl;
  }

  const host = req.get('host');
  if (!host) return null;

  const baseUrl = `${req.protocol}://${host}`;
  return new URL(videoUrl.startsWith('/') ? videoUrl : `/${videoUrl}`, baseUrl).toString();
}

function extractStorageKey(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/storage\/v1\/object\/(?:sign|public)\/clips\/([^?]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  if (!url.startsWith('http')) {
    if (url.startsWith('clips/')) {
      return url.slice('clips/'.length);
    }
    return url;
  }
  return null;
}

async function signClip(clip: any): Promise<any> {
  if (!clip) return clip;
  let updatedClip = { ...clip };
  try {
    if (updatedClip.metadata) {
      updatedClip.metadata = { ...updatedClip.metadata };
    }
    
    // Sign Video URL — DB stores paths, API generates URLs (DB.1)
    // Primary: storage_path column (new schema). Fallback: extract key from legacy video_url.
    let storageKey = clip.storage_path
      || clip.metadata?.video_storage_key
      || clip.metadata?.storage_key
      || extractStorageKey(clip.video_url);
    if (storageKey) {
      if (storageKey.startsWith('clips/')) {
        storageKey = storageKey.slice('clips/'.length);
      }
      const freshSignedUrl = await storageService.createSignedUrl(storageKey);
      updatedClip.video_url = freshSignedUrl;
      if (updatedClip.metadata) {
        updatedClip.metadata.video_url = freshSignedUrl;
      }
    }

    // Sign Captioned/Clean Video URL variations in metadata
    if (updatedClip.metadata?.video_clean_storage_key) {
      let key = updatedClip.metadata.video_clean_storage_key;
      if (key.startsWith('clips/')) key = key.slice('clips/'.length);
      try {
        updatedClip.metadata.video_clean_url = await storageService.createSignedUrl(key);
      } catch {}
    }
    if (updatedClip.metadata?.video_captioned_storage_key) {
      let key = updatedClip.metadata.video_captioned_storage_key;
      if (key.startsWith('clips/')) key = key.slice('clips/'.length);
      try {
        updatedClip.metadata.video_captioned_url = await storageService.createSignedUrl(key);
      } catch {}
    }

    // Sign Thumbnail URL — primary: thumbnail_storage_path column (DB.1)
    let thumbStorageKey = clip.thumbnail_storage_path
      || clip.metadata?.thumbnail_storage_key
      || extractStorageKey(clip.thumbnail_url);
    if (thumbStorageKey) {
      if (thumbStorageKey.startsWith('clips/')) {
        thumbStorageKey = thumbStorageKey.slice('clips/'.length);
      }
      try {
        const freshThumbSignedUrl = await storageService.createSignedUrl(thumbStorageKey);
        updatedClip.thumbnail_url = freshThumbSignedUrl;
        if (updatedClip.metadata) {
          updatedClip.metadata.thumbnail_url = freshThumbSignedUrl;
        }
      } catch (thumbErr: any) {
        console.warn(`[VideoRoute]: Thumbnail sign failed for clip ${clip.id}:`, thumbErr.message);
      }
    }
    
    return updatedClip;
  } catch (signError: any) {
    console.warn(`[VideoRoute]: Failed to re-sign URL for clip ${clip.id || 'unknown'}:`, signError.message);
    // Return updatedClip even on partial failure — at least one URL may have been signed
    return updatedClip || clip;
  }
}

async function signClips(clips: any[]): Promise<any[]> {
  if (!Array.isArray(clips)) return [];
  return Promise.all(clips.map(signClip));
}

async function streamClipResponse(
  clipId: string,
  clip: any,
  req: Request,
  res: Response,
  options: { inline?: boolean } = {},
) {
  const showCaptions = req.query.captions !== '0';
  const videoUrl = clip.storage_path || clip.video_url || '';
  const fileName = getDownloadFileName(clipId, clip);
  const disposition = options.inline ? 'inline' : 'attachment';

  res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Accept-Ranges', 'bytes');

  const localClipPath = resolveLocalClipPath(videoUrl, clip.job_id, showCaptions);
  if (localClipPath && fs.existsSync(localClipPath)) {
    const stats = fs.statSync(localClipPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stats.size.toString());

    const stream = fs.createReadStream(localClipPath);
    stream.on('error', (streamError) => {
      console.error(`[VideoRoute]: Local clip stream failed for ${clipId}:`, streamError);
      stream.destroy();
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream local clip' });
        return;
      }
      res.end();
    });

    req.on('close', () => {
      if (!stream.destroyed) stream.destroy();
    });

    stream.pipe(res);
    return;
  }

  // Resolve storage key, prioritizing the new DB.1 storage_path columns
  let baseStorageKey = clip.storage_path || clip?.metadata?.video_storage_key || extractStorageKey(videoUrl) || '';
  if (baseStorageKey.startsWith('clips/')) baseStorageKey = baseStorageKey.slice('clips/'.length);

  let cleanStorageKey = clip?.metadata?.video_clean_storage_key || baseStorageKey;
  if (cleanStorageKey && cleanStorageKey.startsWith('clips/')) {
    cleanStorageKey = cleanStorageKey.slice('clips/'.length);
  }

  let captionedStorageKey = clip?.metadata?.video_captioned_storage_key || baseStorageKey.replace('-clean.mp4', '.mp4');
  if (captionedStorageKey && captionedStorageKey.startsWith('clips/')) {
    captionedStorageKey = captionedStorageKey.slice('clips/'.length);
  }

  let storageKey = showCaptions ? captionedStorageKey : cleanStorageKey;
  let remoteClipUrl: string | null = null;
  
  if (storageKey) {
    try {
      remoteClipUrl = await storageService.createSignedUrl(storageKey);
    } catch (e: any) {
      if (showCaptions && e.message.includes('Object not found')) {
        console.warn(`[VideoRoute]: Captioned clip not found for ${clipId}, falling back to clean clip.`);
        storageKey = cleanStorageKey;
        remoteClipUrl = await storageService.createSignedUrl(storageKey);
      } else {
        throw e;
      }
    }
  } else {
    remoteClipUrl = resolveRemoteClipUrl(videoUrl, req);
  }

  if (!remoteClipUrl || !/^https?:\/\//i.test(remoteClipUrl)) {
    throw new Error('Clip URL is missing or malformed.');
  }

  const isInternalStorage =
    Boolean(storageKey) ||
    (process.env.SUPABASE_URL && remoteClipUrl.startsWith(process.env.SUPABASE_URL));

  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 120_000);

  let response: {
    statusCode?: number;
    statusText?: string;
    headers: Record<string, string>;
    body: NodeJS.ReadableStream;
  };

  const fetchOptions: RequestInit = { signal: controller.signal };
  if (req.headers.range) {
    fetchOptions.headers = { Range: req.headers.range };
  }

  if (isInternalStorage) {
    // Use native fetch for trusted internal Supabase storage (signed URLs).
    const nativeRes = await fetch(remoteClipUrl, fetchOptions);
    clearTimeout(fetchTimeout);

    if (!nativeRes.ok) {
      throw new Error(`Failed to fetch video from storage: ${nativeRes.status} ${nativeRes.statusText}`);
    }

    const headers: Record<string, string> = {};
    nativeRes.headers.forEach((value, key) => { headers[key] = value; });

    res.status(nativeRes.status);
    res.setHeader('Content-Type', headers['content-type'] || 'video/mp4');
    if (headers['content-length']) res.setHeader('Content-Length', headers['content-length']);
    if (headers['content-range']) res.setHeader('Content-Range', headers['content-range']);
    if (headers['accept-ranges']) res.setHeader('Accept-Ranges', headers['accept-ranges']);
    if (headers['cache-control']) res.setHeader('Cache-Control', headers['cache-control']);

    const { Readable } = await import('stream');
    const nodeStream = Readable.fromWeb(nativeRes.body as any);

    nodeStream.on('error', (error) => {
      console.error(`[VideoRoute]: Internal storage stream error for ${clipId}:`, error);
      nodeStream.destroy();
      if (!res.headersSent) {
        res.status(500).json({ error: 'Storage stream interrupted' });
      } else {
        res.end();
      }
    });

    req.on('close', () => {
      if (!nodeStream.destroyed) nodeStream.destroy();
    });

    nodeStream.pipe(res);
    return;
  }

  // For external (user-supplied) URLs: use fetchSecurely for SSRF protection + DNS pinning
  const secureOptions: any = {
    enforceHostPolicy: true,
    signal: controller.signal,
  };
  if (req.headers.range) {
    secureOptions.headers = { Range: req.headers.range };
  }

  const secureResponse = await fetchSecurely(remoteClipUrl, secureOptions);
  clearTimeout(fetchTimeout);

  if (secureResponse.statusCode && secureResponse.statusCode >= 400) {
    throw new Error(`Failed to fetch video from storage: ${secureResponse.statusCode} ${secureResponse.statusText}`);
  }

  const contentType = secureResponse.headers['content-type'];
  const contentLength = secureResponse.headers['content-length'];
  const contentRange = secureResponse.headers['content-range'];
  const acceptRanges = secureResponse.headers['accept-ranges'];
  const cacheControl = secureResponse.headers['cache-control'];

  if (secureResponse.statusCode) res.status(secureResponse.statusCode);
  res.setHeader('Content-Type', contentType || 'video/mp4');
  if (contentLength) res.setHeader('Content-Length', contentLength);
  if (contentRange) res.setHeader('Content-Range', contentRange);
  if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
  if (cacheControl) res.setHeader('Cache-Control', cacheControl);

  const proxyStream = secureResponse.body;
  proxyStream.on('error', (error) => {
    console.error(`[VideoRoute]: Proxy stream error for ${clipId}:`, error);
    proxyStream.destroy();
    if (!res.headersSent) {
      res.status(500).json({ error: 'Proxy stream interrupted' });
    } else {
      res.end();
    }
  });

  req.on('close', () => {
    if (!proxyStream.destroyed) proxyStream.destroy();
  });

  proxyStream.pipe(res);
}

/**
 * @route   POST /api/video/upload
 * @desc    Upload a local video file for processing
 */
router.post('/upload', requireUserJWT, jobSubmissionRateLimit, upload.single('video'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const numClips = parseInt(req.body.numClips as string) || 2;
  const intent = (req.body.intent as string) || 'viral';
  const avoidSimilarClips = (req.body.avoidSimilarClips as string) || 'balanced';
  const generationMode = (req.body.generationMode as 'draft' | 'quality') || 'draft';
  const filePath = req.file.path;

  try {
    // Perform Magic Bytes and integrity checks
    const verification = await verifyUploadedMedia(filePath, 'video');
    if (!verification.valid) {
      console.warn(`[VideoRoute]: Uploaded file validation failed: ${verification.error}`);
      try { fs.unlinkSync(filePath); } catch {}
      return res.status(400).json({ error: verification.error || 'Invalid video file format' });
    }

    // Add job with LOCAL file path and associate with the user ID
    const jobId = await queueService.addJob({ 
      videoUrl: filePath, // Using videoUrl field to store local path
      numClips,
      intent,
      avoidSimilarClips,
      generationMode,
      userId: req.user.id
    });

    return res.status(202).json({ 
      message: 'Upload successful. Job submitted.', 
      jobId 
    });
  } catch (error: any) {
    console.error('[VideoRoute]: Upload job failed:', error);
    try { fs.unlinkSync(filePath); } catch {}
    return res.status(500).json({ error: error.message });
  }
});

/**
 * @route   POST /api/video/generate-clips
 * @desc    Start the clip generation process (from URL)
 */
router.post(
  '/generate-clips',
  requireUserJWT,
  jobSubmissionRateLimit,
  validateVideoUrlMiddleware,
  [
    body('numClips').optional().isInt({ min: 1, max: 10 }).withMessage('Number of clips must be between 1 and 10'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

      const { videoUrl, numClips, purge, intent, avoidSimilarClips, generationMode } = req.body;
      
      try {
        const db = new DatabaseService();
        
        // Only purge if explicitly requested (scoped to requesting user)
        if (purge === true) {
          await db.clearUserContent(req.user.id);
        }
  
        const jobId = await queueService.addJob({ 
          videoUrl, 
          numClips: numClips || 2,
          intent: intent || 'viral',
          avoidSimilarClips: avoidSimilarClips || 'balanced',
          generationMode: generationMode || 'draft',
          userId: req.user.id
        });

      return res.status(202).json({ 
        message: 'Job submitted to queue', 
        jobId 
      });
    } catch (error: any) {
      const errorLog = `[${new Date().toISOString()}] REQ ERROR: ${error.message}\n${error.stack}\n`;
      fs.appendFileSync('error.log', errorLog);
      console.error('[VideoRoute]: Failed to add job to queue:', error);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
);

/**
 * @route   POST /api/video/purge
 * @desc    Clear all clips, jobs, and temporary storage
 */
router.post('/purge', jobSubmissionRateLimit, requireUserJWT, async (req: Request, res: Response) => {
  if (!purgeEnabled) {
    return res.status(403).json({
      error: 'Purge is disabled in this environment.',
    });
  }

  const db = new DatabaseService();
  try {
    await db.clearUserContent(req.user.id);
    return res.json({ message: 'Neural memory vaporized. Storage cleared.' });
  } catch (error: any) {
    console.error('[VideoRoute]: Purge failed:', error);
    return res.status(500).json({ error: 'Failed to purge neural storage' });
  }
});

/**
 * GET /api/video/jobs
 * Returns all recent jobs (active and historical) for tracking and controls
 */
router.get('/jobs', requireUserJWT, async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase()
      .from('jobs')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(15);

    if (error) throw error;
    return res.json(data || []);
  } catch (error: any) {
    console.warn('[VideoRoute]: Jobs fetch failed, falling back to local DB:', error.message);
    const fs = require('fs');
    const path = require('path');
    const localDbPath = path.join(process.cwd(), 'temp', 'local_db.json');
    if (fs.existsSync(localDbPath)) {
      try {
        const localDb = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
        const userJobs = (localDb.jobs || [])
          .filter((j: any) => j.user_id === req.user.id)
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 15);
        return res.json(userJobs);
      } catch {}
    }
    return res.json([]);
  }
});

/**
 * GET /api/video/jobs/active
 * Returns all queued or processing jobs for real-time tracking
 */
router.get('/jobs/active', requireUserJWT, async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase()
      .from('jobs')
      .select('*')
      .eq('user_id', req.user.id)
      .in('status', ['queued', 'processing', 'retrying', 'transcribing', 'detecting_clips', 'recovering', 'cutting', 'captioning'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json(data || []);
  } catch (error: any) {
    console.warn('[VideoRoute]: Active jobs fetch failed, falling back to local DB:', error.message);
    const fs = require('fs');
    const path = require('path');
    const localDbPath = path.join(process.cwd(), 'temp', 'local_db.json');
    const activeStatuses = ['queued', 'processing', 'retrying', 'transcribing', 'detecting_clips', 'recovering', 'cutting', 'captioning'];
    if (fs.existsSync(localDbPath)) {
      try {
        const localDb = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
        const userActiveJobs = (localDb.jobs || [])
          .filter((j: any) => j.user_id === req.user.id && activeStatuses.includes(j.status))
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return res.json(userActiveJobs);
      } catch {}
    }
    return res.json([]);
  }
});

/**
 * @route   POST /api/video/estimate
 * @desc    Get an estimate of how many clips a video can yield
 */
router.post(
  '/estimate',
  metadataLookupRateLimit,
  requireUserJWT,
  validateVideoUrlMiddleware,
  async (req: Request, res: Response) => {
    const { videoUrl } = req.body;
    try {
      const processor = new VideoProcessor();
    let duration = 0;
    try {
      duration = await processor.getVideoDuration(videoUrl);
      } catch (durationError) {
        console.warn('[VideoRoute]: Duration lookup failed for estimation, using fallback.');
        // Fallback to 0 duration (meaning we skip the specific count/duration info)
        // or a default value like 300 (5 mins) for a generic "Ready" state.
        duration = 0;
      }
      
      // Estimate 1 clip per 60 seconds of video, minimum 1, max 10
      // If duration is 0, just suggest 3 clips as a safe default.
      const estimate = duration > 0 
        ? Math.min(Math.max(Math.floor(duration / 60), 1), 10)
        : 3;
      
      return res.json({ 
        duration, 
        estimate,
        message: duration > 0 
          ? `Estimated ${estimate} high-quality clips available.`
          : `Neural core ready to analyze. Suggesting ${estimate} clips.`
      });
    } catch (error: any) {
      console.error('[VideoRoute]: Estimation route crash prevented:', error);
      return res.status(200).json({ 
        duration: 0, 
        estimate: 3, 
        message: 'Neural estimation bypassed due to connection friction.' 
      });
    }
  }
);

/**
 * @route   GET /api/video/status/:jobId
 * @desc    Check the status of a clip generation job
 */
router.get('/status/:jobId', requireUserJWT, async (req: Request, res: Response) => {
  const jobId = String(req.params.jobId);

  try {
    const db = new DatabaseService();
    const dbJob = await db.getJobWithClips(jobId as string);
    if (!dbJob) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (!denyUnlessOwner(dbJob.user_id, req.user.id, res, 'job')) {
      return;
    }

    const status = await queueService.getJobStatus(jobId as string);
    if (!status) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Dynamically sign any returned clips in status
    if (status.clips && Array.isArray(status.clips)) {
      status.clips = await signClips(status.clips);
    }
    if (status.result && Array.isArray(status.result)) {
      status.result = await signClips(status.result);
    }
    if (status.result && !Array.isArray(status.result) && typeof status.result === 'object') {
      if (status.result.output_url) {
        const key = extractStorageKey(status.result.output_url);
        if (key) {
          try {
            status.result.output_url = await storageService.createSignedUrl(key);
          } catch {}
        }
      }
    }
    
    return res.json(status);
  } catch (error: any) {
    console.error(`[VideoRoute]: Failed to fetch job status for ${jobId}:`, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   GET /api/video/clips
 * @desc    Get all recent clips
 */
router.get('/clips', requireUserJWT, async (req: Request, res: Response) => {
  const db = new DatabaseService();
  try {
    const clips = await db.getRecentClips(req.user.id);
    const signedClips = await signClips(clips);
    return res.json(signedClips);
  } catch (error: any) {
    console.error('[VideoRoute]: Failed to fetch recent clips:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   GET /api/video/download/:clipId
 * @desc    Proxy download for a clip to bypass CORS/security restrictions.
 *          Hardened: Accept-Ranges, keep-alive, client-disconnect cleanup,
 *          nosniff, stream error boundaries.
 */
router.post('/play-token/:clipId', requireUserJWT, async (req: Request, res: Response) => {
  const clipId = String(req.params.clipId);
  const db = new DatabaseService();

  try {
    const clip = await db.getClip(clipId as string);
    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    if (!denyUnlessOwner(getClipOwnerId(clip), req.user.id, res, 'clip')) {
      return;
    }

    const token = createPlayToken(clipId, req.user.id);
    const playUrl = buildPlayUrl(req, clipId as string, token);
    // Also provide a direct download URL using the same token
    const downloadUrl = `${playUrl}&dl=1`;

    return res.json({
      playUrl,
      downloadUrl,
      expiresInSeconds: 15 * 60,
    });
  } catch (error: any) {
    console.error(`[VideoRoute]: Failed to issue play token for ${clipId}:`, error);
    return res.status(500).json({ error: 'Failed to issue play token' });
  }
});

/**
 * @route   POST /api/video/download-token/:clipId
 * @desc    Issue a short-lived signed download URL for direct browser download.
 *          Opens natively in the browser with proper filename — no JS blob needed.
 */
router.post('/download-token/:clipId', requireUserJWT, async (req: Request, res: Response) => {
  const clipId = String(req.params.clipId);
  const db = new DatabaseService();

  try {
    const clip = await db.getClip(clipId as string);
    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    if (!denyUnlessOwner(getClipOwnerId(clip), req.user.id, res, 'clip')) {
      return;
    }

    const token = createPlayToken(clipId, req.user.id);
    const playUrl = buildPlayUrl(req, clipId as string, token);
    const downloadUrl = `${playUrl}&dl=1`;

    return res.json({
      downloadUrl,
      expiresInSeconds: 15 * 60,
    });
  } catch (error: any) {
    console.error(`[VideoRoute]: Failed to issue download token for ${clipId}:`, error);
    return res.status(500).json({ error: 'Failed to issue download token' });
  }
});

router.get('/play/:clipId', async (req: Request, res: Response) => {
  const clipId = String(req.params.clipId);
  const playToken = typeof req.query.pt === 'string' ? req.query.pt : '';
  const userId = verifyPlayToken(playToken, clipId as string);

  if (!userId) {
    return res.status(401).json({ error: 'Invalid or expired play token' });
  }

  const db = new DatabaseService();

  try {
    const clip = await db.getClip(clipId as string);
    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    if (!denyUnlessOwner(getClipOwnerId(clip), userId, res, 'clip')) {
      return;
    }

    // ?dl=1 forces attachment disposition for direct browser download
    const forceDownload = req.query.dl === '1';
    await streamClipResponse(clipId, clip, req, res, { inline: !forceDownload });
  } catch (error: any) {
    console.error(`[VideoRoute]: Play stream failed for ${clipId}:`, error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to stream video' });
    }
    res.end();
  }
});

router.get('/download/:clipId', requireUserJWT, async (req: Request, res: Response) => {
  const clipId = String(req.params.clipId);
  const db = new DatabaseService();

  try {
    const clip = await db.getClip(clipId as string);
    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    if (!denyUnlessOwner(getClipOwnerId(clip), req.user.id, res, 'clip')) {
      return;
    }

    console.log(`[VideoRoute]: Initiating proxy download for clip ${clipId}`);
    await streamClipResponse(clipId, clip, req, res);
  } catch (error: any) {
    console.error(`[VideoRoute]: Download proxy failed for ${clipId}:`, error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to stream video' });
    }
    res.end();
  }
});

router.get('/test-download/:clipId', async (req: Request, res: Response) => {
  const clipId = String(req.params.clipId);
  const db = new DatabaseService();

  try {
    const clip = await db.getClip(clipId);
    if (!clip) return res.status(404).json({ error: 'Clip not found' });
    console.log(`[VideoRoute]: Initiating TEST proxy download for clip ${clipId}`);
    await streamClipResponse(clipId, clip, req, res);
  } catch (error: any) {
    console.error(`[VideoRoute]: Test Download proxy failed for ${clipId}:`, error);
    if (!res.headersSent) return res.status(500).json({ error: 'Failed to stream video' });
    res.end();
  }
});

/**
 * @route   GET /api/video/stats
 * @desc    Get platform stats
 */
router.get('/stats', requireUserJWT, async (req: Request, res: Response) => {
  const db = new DatabaseService();
  try {
    const stats = await db.getStats(req.user.id);
    return res.json(stats);
  } catch (error: any) {
    console.error('[VideoRoute]: Failed to fetch stats:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   POST /api/video/jobs/:jobId/cancel
 * @desc    Cancel a processing or queued video job
 */
router.post('/jobs/:jobId/cancel', requireUserJWT, async (req: Request, res: Response) => {
  const jobId = String(req.params.jobId);
  const db = new DatabaseService();
  try {
    const job = await db.getJobWithClips(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (!denyUnlessOwner(job.user_id, req.user.id, res, 'job')) {
      return;
    }

    // Cancel in Supabase and memory
    await db.updateJob(jobId, { status: 'cancelled' });
    await queueService.updateJobStatus(jobId, { status: 'cancelled' });

    console.log(`[VideoRoute]: Job ${jobId} cancellation requested by user ${req.user.id}`);
    return res.json({ message: 'Job cancellation requested successfully.' });
  } catch (error: any) {
    console.error(`[VideoRoute]: Failed to cancel job ${jobId}:`, error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * @route   POST /api/video/jobs/:jobId/retry
 * @desc    Retry a failed, cancelled, or dead_letter job
 */
router.post('/jobs/:jobId/retry', requireUserJWT, async (req: Request, res: Response) => {
  const jobId = String(req.params.jobId);
  const db = new DatabaseService();
  try {
    const job = await db.getJobWithClips(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (!denyUnlessOwner(job.user_id, req.user.id, res, 'job')) {
      return;
    }

    const terminalStatuses = ['failed', 'cancelled', 'dead_letter'];
    if (!terminalStatuses.includes(job.status)) {
      return res.status(400).json({ error: `Only failed, cancelled, or dead_letter jobs can be retried. Current status is '${job.status}'.` });
    }

    // Reset attempts / payload retry configuration
    const payload = job.payload && typeof job.payload === 'object' ? { ...job.payload } : {};
    if (payload.retry) {
      delete payload.retry;
    }

    await db.updateJob(jobId, {
      status: 'queued',
      progress: 0,
      failed_reason: null,
      payload
    });
    await queueService.updateJobStatus(jobId, {
      status: 'queued',
      progress: 0,
      failedReason: null,
      retryAttempt: 0
    });

    console.log(`[VideoRoute]: Job ${jobId} retry requested by user ${req.user.id}`);
    return res.json({ message: 'Job retry scheduled successfully.' });
  } catch (error: any) {
    console.error(`[VideoRoute]: Failed to retry job ${jobId}:`, error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * @route   POST /api/video/jobs/:jobId/restart
 * @desc    Restart a job from scratch, regardless of its current status
 */
router.post('/jobs/:jobId/restart', requireUserJWT, async (req: Request, res: Response) => {
  const jobId = String(req.params.jobId);
  const db = new DatabaseService();
  try {
    const job = await db.getJobWithClips(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (!denyUnlessOwner(job.user_id, req.user.id, res, 'job')) {
      return;
    }

    // Reset attempts / payload retry configuration
    const payload = job.payload && typeof job.payload === 'object' ? { ...job.payload } : {};
    if (payload.retry) {
      delete payload.retry;
    }

    // Delete any existing clips for this job
    await db.getSupabase().from('clips').delete().eq('job_id', jobId);

    await db.updateJob(jobId, {
      status: 'queued',
      progress: 0,
      failed_reason: null,
      payload
    });
    await queueService.updateJobStatus(jobId, {
      status: 'queued',
      progress: 0,
      failedReason: null,
      retryAttempt: 0,
      clips: []
    });

    console.log(`[VideoRoute]: Job ${jobId} restart requested by user ${req.user.id}`);
    return res.json({ message: 'Job restart scheduled successfully.' });
  } catch (error: any) {
    console.error(`[VideoRoute]: Failed to restart job ${jobId}:`, error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * @route   POST /api/video/admin/reset-workspace
 * @desc    Admin action: soft-archive all existing clips and offer reprocessing
 */
router.post('/admin/reset-workspace', requireUserJWT, async (req: Request, res: Response) => {
  const db = new DatabaseService();
  const reprocess = req.body.reprocess === true;
  
  try {
    // 1. Get all jobs for this user to filter user-specific clips
    const { data: jobs, error: jobsError } = await db.getSupabase()
      .from('jobs')
      .select('id')
      .eq('user_id', req.user.id);
      
    if (jobsError) throw jobsError;
    const jobIds = jobs?.map(j => j.id) || [];
    
    if (jobIds.length > 0) {
      // Soft archive all clips by setting is_archived = true
      const { error: updateError } = await db.getSupabase()
        .from('clips')
        .update({ is_archived: true })
        .in('job_id', jobIds);
        
      if (updateError) throw updateError;
    }

    let reprocessedJobsCount = 0;
    if (reprocess && jobIds.length > 0) {
      // Get all jobs that either failed, were cancelled, or generated recovery/heuristic clips
      const { data: jobsToReprocess, error: reprocessQueryError } = await db.getSupabase()
        .from('jobs')
        .select('*')
        .in('id', jobIds)
        .in('status', ['failed', 'cancelled', 'dead_letter']);

      if (reprocessQueryError) throw reprocessQueryError;

      if (jobsToReprocess && jobsToReprocess.length > 0) {
        reprocessedJobsCount = jobsToReprocess.length;
        for (const job of jobsToReprocess) {
          // Re-queue the job
          const payload = job.payload && typeof job.payload === 'object' ? { ...job.payload } : {};
          if (payload.retry) {
            delete payload.retry;
          }
          await db.updateJob(job.id, {
            status: 'queued',
            progress: 0,
            failed_reason: null,
            payload
          });
          await queueService.updateJobStatus(job.id, {
            status: 'queued',
            progress: 0,
            failedReason: null,
            retryAttempt: 0
          });
        }
      }
    }

    return res.json({
      message: 'Workspace successfully reset.',
      archivedClipsCount: jobIds.length,
      reprocessedJobsCount
    });
  } catch (error: any) {
    console.error('[VideoRoute]: Failed to reset workspace:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * @route   POST /api/video/preferences
 * @desc    Submit user pairwise clip preference matchup vote
 */
router.post('/preferences', requireUserJWT, async (req: Request, res: Response) => {
  const { winnerClipId, loserClipId, winnerReason, ratings } = req.body;
  if (!winnerClipId || !loserClipId) {
    return res.status(400).json({ error: 'winnerClipId and loserClipId are required.' });
  }
  const db = new DatabaseService();
  try {
    const { data, error } = await db.getSupabase()
      .from('human_preference_matchups')
      .insert({
        winner_clip_id: winnerClipId,
        loser_clip_id: loserClipId,
        winner_reason: winnerReason || null,
        ratings: ratings || {},
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (error: any) {
    console.error('[VideoRoute]: Failed to save human preference matchups:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * @route   POST /api/video/clips/:clipId/feedback
 * @desc    Submit editor feedback on a clip (boundary adjustments or general feedback)
 */
router.post('/clips/:clipId/feedback', requireUserJWT, async (req: Request, res: Response) => {
  const clipId = String(req.params.clipId);
  const { jobId, narrativeType, predictedStart, predictedEnd, editorAdjustedStart, editorAdjustedEnd, feedbackType, comment } = req.body;
  
  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required.' });
  }

  const { boundaryFailureEngine } = require('../services/intelligence/BoundaryFailureEngine');

  try {
    // If boundary adjustments are provided, log them
    if (editorAdjustedStart !== undefined && editorAdjustedEnd !== undefined && predictedStart !== undefined && predictedEnd !== undefined) {
      await boundaryFailureEngine.logAdjustment({
        jobId,
        clipId,
        narrativeType: narrativeType || 'Unknown',
        predictedStart: Number(predictedStart),
        predictedEnd: Number(predictedEnd),
        editorAdjustedStart: Number(editorAdjustedStart),
        editorAdjustedEnd: Number(editorAdjustedEnd)
      });
    }

    // If general feedback is provided, log it
    if (feedbackType) {
      await boundaryFailureEngine.logEditorFeedback(jobId, clipId, feedbackType, comment);
    }

    return res.status(201).json({ message: 'Feedback logged successfully.' });
  } catch (error: any) {
    console.error(`[VideoRoute]: Failed to log feedback for clip ${clipId}:`, error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export default router;
