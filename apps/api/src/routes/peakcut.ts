import { Router, Request, Response } from 'express';
import { audioPeakDetector } from '../services/intelligence/AudioPeakDetector';
import { requireUserJWT } from '../middleware/auth';

const router = Router();

/**
 * GET /api/peakcut/presets
 * Returns available 9:16 vertical layouts, detection strategies, and caption styles.
 */
router.get('/presets', (req: Request, res: Response) => {
  res.json({
    aspectRatio: '9:16',
    targetDimensions: { width: 1080, height: 1920 },
    framingModes: [
      {
        id: 'fit_headline',
        label: '16:9 Fit + Top Headline (Meme Card)',
        description: 'Uncropped 16:9 video centered inside 9:16 frame with bold top viral hook and bottom subtitles (TikTok / Reels layout).',
        icon: 'layout',
        idealFor: 'Podcasts, presentations, memes, anime, tech slides',
      },
      {
        id: 'smart_crop',
        label: 'Smart Pan & Scan',
        description: 'Dynamically centers on the active speaker or action.',
        icon: 'scan',
        idealFor: 'Interviews, podcasts, commentary',
      },
      {
        id: 'fit_blur',
        label: 'Ambient Blurred Background',
        description: 'Fits the full horizontal frame over an aesthetically blurred 9:16 backdrop.',
        icon: 'layers',
        idealFor: 'Twitch/Kick streams, gaming, sports',
      },
      {
        id: 'face_focus',
        label: 'Tight Face Punch-in (1.35x)',
        description: 'Tightly crops to face and upper body for maximum emotional hook.',
        icon: 'user-check',
        idealFor: 'Reaction videos, monologue hooks',
      },
      {
        id: 'split_stack',
        label: 'Split-Screen Stack',
        description: 'Dual-camera split with face on top and content on bottom.',
        icon: 'split',
        idealFor: 'Gaming with facecam, dual-host debates',
      },
    ],
    detectionStrategies: [
      {
        id: 'audio_peaks',
        label: 'Audio Energy & Loudness Peaks (PeakCut Mode)',
        description: 'Cuts clips anchored to sudden volume spikes, laughter, screams, and hype.',
      },
      {
        id: 'ai_highlights',
        label: 'AI Viral Hooks & Narrative Arc',
        description: 'Analyzes spoken transcripts to locate high-retention hooks and story payoffs.',
      },
      {
        id: 'hybrid',
        label: 'Hybrid Peak + Coherence',
        description: 'Combines acoustic energy spikes with grammatical sentence snapping.',
      },
    ],
    captionPresets: [
      { id: 'tiktok', name: 'TikTok Pop', color: '#facc15', outline: 4, font: 'Inter Black' },
      { id: 'submagic', name: 'Submagic Vibrant', color: '#ec4899', outline: 4, font: 'Inter Black' },
      { id: 'hormozi', name: 'Alex Hormozi Gold', color: '#eab308', outline: 4, font: 'Montserrat ExtraBold', italic: true },
      { id: 'mrbeast', name: 'MrBeast Neon', color: '#22c55e', outline: 4, font: 'Inter Black' },
      { id: 'neon', name: 'Electric Cyan', color: '#00ffff', outline: 4, font: 'Inter Bold' },
      { id: 'minimalist', name: 'Minimal Clean', color: '#ffffff', outline: 2, font: 'Inter SemiBold' },
    ],
  });
});

/**
 * POST /api/peakcut/detect-peaks
 * Analyzes audio energy timeline to detect loudness spikes (PeakCut highlight detection).
 */
router.post('/detect-peaks', (req: Request, res: Response) => {
  const { timeline, totalDurationSec, options } = req.body;

  if (!Array.isArray(timeline) || typeof totalDurationSec !== 'number') {
    return res.status(400).json({ error: 'Invalid input: timeline must be an array and totalDurationSec a number.' });
  }

  const candidates = audioPeakDetector.detectPeaks(timeline, totalDurationSec, options || {});
  return res.json({
    strategy: 'audio_energy_peaks',
    candidatesCount: candidates.length,
    candidates,
  });
});

export default router;
