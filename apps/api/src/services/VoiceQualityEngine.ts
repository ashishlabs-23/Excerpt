import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getBinaryPath } from './videoProcessor';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface VoiceQualityReport {
  score: number;              // 0–100
  passed: boolean;            // score >= 70
  issues: QualityIssue[];
  suggestions: string[];
  metrics: QualityMetrics;
}

export interface QualityIssue {
  type: 'clipping' | 'long_pause' | 'short_pause' | 'poor_pacing' | 'sync_drift' | 'low_energy';
  severity: 'critical' | 'warning' | 'info';
  detail: string;
  penalty: number;
}

export interface QualityMetrics {
  peakDbFS: number;
  meanDbFS: number;
  durationMs: number;
  estimatedWPM: number;
  silenceSegments: Array<{ startMs: number; durationMs: number }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// FFmpeg helpers
// ─────────────────────────────────────────────────────────────────────────────

function runFFprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffprobe = getBinaryPath('ffprobe');
    execFile(ffprobe, args, { maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout + '\n' + stderr);
    });
  });
}

function runFFmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const ffmpeg = getBinaryPath('ffmpeg');
    execFile(ffmpeg, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      // FFmpeg prints to stderr; non-zero exit is the real error signal
      if (err && !stderr.includes('volumedetect') && !stderr.includes('silencedetect')) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout + '\n' + stderr);
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis routines
// ─────────────────────────────────────────────────────────────────────────────

async function getAudioDuration(audioPath: string): Promise<number> {
  const out = await runFFprobe([
    '-v', 'quiet', '-print_format', 'json',
    '-show_streams', audioPath,
  ]);
  try {
    const json = JSON.parse(out);
    const stream = json.streams?.[0];
    return parseFloat(stream?.duration || '0') * 1000; // ms
  } catch {
    return 0;
  }
}

async function getVolumeStats(audioPath: string): Promise<{ peak: number; mean: number }> {
  const output = await runFFmpeg([
    '-i', audioPath,
    '-af', 'volumedetect',
    '-vn', '-sn', '-dn',
    '-f', 'null', '-',
  ]);

  const peakMatch = output.match(/max_volume:\s*([-\d.]+)\s*dB/);
  const meanMatch = output.match(/mean_volume:\s*([-\d.]+)\s*dB/);

  return {
    peak: peakMatch ? parseFloat(peakMatch[1]) : -99,
    mean: meanMatch ? parseFloat(meanMatch[1]) : -99,
  };
}

async function detectSilence(audioPath: string): Promise<Array<{ startMs: number; durationMs: number }>> {
  const output = await runFFmpeg([
    '-i', audioPath,
    '-af', 'silencedetect=noise=-40dB:duration=0.3',
    '-vn', '-sn', '-dn',
    '-f', 'null', '-',
  ]);

  const segments: Array<{ startMs: number; durationMs: number }> = [];
  const startRegex = /silence_start:\s*([\d.]+)/g;
  const endRegex = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;

  let startMatch;
  let endMatch;
  const starts: number[] = [];
  const ends: Array<{ end: number; dur: number }> = [];

  while ((startMatch = startRegex.exec(output)) !== null) {
    starts.push(parseFloat(startMatch[1]) * 1000);
  }
  while ((endMatch = endRegex.exec(output)) !== null) {
    ends.push({ end: parseFloat(endMatch[1]) * 1000, dur: parseFloat(endMatch[2]) * 1000 });
  }

  for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
    segments.push({ startMs: starts[i], durationMs: ends[i].dur });
  }

  return segments;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

function scoreAudio(
  metrics: QualityMetrics,
  originalText: string
): { issues: QualityIssue[]; suggestions: string[]; score: number } {
  const issues: QualityIssue[] = [];
  const suggestions: string[] = [];
  let penalty = 0;

  // 1. Audio clipping check (peak > -1 dBFS)
  if (metrics.peakDbFS > -1) {
    issues.push({
      type: 'clipping',
      severity: 'critical',
      detail: `Peak level is ${metrics.peakDbFS.toFixed(1)} dBFS — audio is clipping.`,
      penalty: 20,
    });
    suggestions.push('Reduce volumeGainDb in voice config to prevent clipping.');
    penalty += 20;
  }

  // 2. Low energy check (mean < -30 dBFS)
  if (metrics.meanDbFS < -30) {
    issues.push({
      type: 'low_energy',
      severity: 'warning',
      detail: `Mean level is ${metrics.meanDbFS.toFixed(1)} dBFS — audio is too quiet.`,
      penalty: 10,
    });
    suggestions.push('Increase volumeGainDb or use FFmpeg loudnorm filter.');
    penalty += 10;
  }

  // 3. Pause analysis
  for (const seg of metrics.silenceSegments) {
    if (seg.durationMs > 2000) {
      issues.push({
        type: 'long_pause',
        severity: 'warning',
        detail: `Long pause of ${(seg.durationMs / 1000).toFixed(1)}s at ${(seg.startMs / 1000).toFixed(1)}s.`,
        penalty: 10,
      });
      suggestions.push('Add punctuation or a break tag to intentionally structure the pause.');
      penalty += 10;
    } else if (seg.durationMs < 100 && seg.startMs > 200) {
      issues.push({
        type: 'short_pause',
        severity: 'info',
        detail: `Unnatural micro-pause of ${seg.durationMs.toFixed(0)}ms at ${(seg.startMs / 1000).toFixed(1)}s.`,
        penalty: 3,
      });
      penalty += 3;
    }
  }

  // 4. Pacing (WPM)
  if (metrics.estimatedWPM < 100 && metrics.durationMs > 2000) {
    issues.push({
      type: 'poor_pacing',
      severity: 'warning',
      detail: `Estimated ${metrics.estimatedWPM} WPM — pacing is too slow.`,
      penalty: 15,
    });
    suggestions.push('Increase speakingRate in voice config (try 1.1 – 1.3).');
    penalty += 15;
  } else if (metrics.estimatedWPM > 220) {
    issues.push({
      type: 'poor_pacing',
      severity: 'warning',
      detail: `Estimated ${metrics.estimatedWPM} WPM — pacing is too fast.`,
      penalty: 15,
    });
    suggestions.push('Reduce speakingRate in voice config (try 0.85 – 0.95).');
    penalty += 15;
  }

  const score = Math.max(0, Math.min(100, 100 - penalty));
  return { issues, suggestions, score };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export class VoiceQualityEngine {
  private static instance: VoiceQualityEngine;

  static getInstance(): VoiceQualityEngine {
    if (!VoiceQualityEngine.instance) {
      VoiceQualityEngine.instance = new VoiceQualityEngine();
    }
    return VoiceQualityEngine.instance;
  }

  /**
   * Analyses a synthesized audio file and returns a quality report with 0–100 score.
   * @param audioPath     Path to the MP3/WAV file
   * @param originalText  The source narration text (used for WPM estimation)
   */
  async analyze(audioPath: string, originalText: string): Promise<VoiceQualityReport> {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found for quality analysis: ${audioPath}`);
    }

    console.log(`[VoiceQualityEngine]: Analysing ${path.basename(audioPath)}...`);

    const [durationMs, volumeStats, silenceSegs] = await Promise.all([
      getAudioDuration(audioPath),
      getVolumeStats(audioPath),
      detectSilence(audioPath),
    ]);

    const wordCount = originalText.trim().split(/\s+/).length;
    const estimatedWPM =
      durationMs > 0 ? Math.round((wordCount / durationMs) * 60000) : 0;

    const metrics: QualityMetrics = {
      peakDbFS: volumeStats.peak,
      meanDbFS: volumeStats.mean,
      durationMs,
      estimatedWPM,
      silenceSegments: silenceSegs,
    };

    const { issues, suggestions, score } = scoreAudio(metrics, originalText);
    const passed = score >= 70;

    console.log(`[VoiceQualityEngine]: Score ${score}/100 — ${passed ? 'PASSED' : 'FAILED'} (${issues.length} issues)`);

    return { score, passed, issues, suggestions, metrics };
  }

  /** Quick check — just returns pass/fail + score without full report */
  async quickScore(audioPath: string, text: string): Promise<number> {
    try {
      const report = await this.analyze(audioPath, text);
      return report.score;
    } catch {
      return 0;
    }
  }
}
