import crypto from 'crypto';

export type SegmentType = 'narration' | 'intro' | 'outro' | 'transition';

export interface VoiceoverSegment {
  id: string;
  type: SegmentType;
  startTime: number;      // Seconds from video start (e.g. 0.0, 3.5)
  endTime: number;        // Expected end time in seconds
  text: string;           // Narration text for this segment
  voice?: string;         // Voice identifier (e.g. 'pNInz6obpgDQGcFmaJgB')
  provider?: 'elevenlabs' | 'google' | 'openai';
  speakingRate?: number;  // 0.5 - 2.0
  pitch?: number;         // Pitch offset
  volumeGainDb?: number;  // Volume gain in dB
  excitement?: number;    // 0.0 - 1.0
  energy?: number;        // 0.0 - 1.0
  drama?: number;         // 0.0 - 1.0
}

export interface VoiceoverTimeline {
  segments: VoiceoverSegment[];
  totalDuration?: number;
}

export type OriginalAudioPolicy = 'duck' | 'keep' | 'mute';
export type DurationPolicy = 'clamp_to_video' | 'extend_video' | 'fail_if_overflow';

export interface DuckingPolicy {
  duckLevelDb: number;    // Background attenuation in dB (e.g. -14 dB)
  attackMs: number;       // Attack time in ms (e.g. 25 ms)
  releaseMs: number;      // Release time in ms (e.g. 250 ms)
}

export interface NormalizationPolicy {
  enabled: boolean;
  targetLUFS: number;     // e.g. -16 LUFS (EBU R128 standard)
  truePeakDb: number;     // e.g. -1.5 dBFS
}

export interface CaptionPolicy {
  enabled: boolean;
  preset?: 'hormozi' | 'mrbeast' | 'neon' | 'minimalist' | 'submagic' | 'tiktok' | 'minimal' | string;
  burn?: boolean; // Default true (burn in with libass)
}

export interface VoiceoverPlan {
  version: '1.0';
  id: string;
  sourceClipId: string;
  sourceVideoUrl: string;
  targetDuration: number; // Explicit target duration in seconds
  timeline: VoiceoverTimeline;
  originalAudioPolicy: OriginalAudioPolicy;
  duckingPolicy: DuckingPolicy;
  normalizationPolicy: NormalizationPolicy;
  durationPolicy: DurationPolicy;
  captions?: CaptionPolicy;
  outputFormat: {
    audioCodec: string;
    audioBitrate: string;
    sampleRate: number;
  };
  metadata?: Record<string, any>;
}

export interface BuildPlanParams {
  id?: string;
  sourceClipId: string;
  sourceVideoUrl: string;
  targetDuration: number;
  segments: Array<{
    id?: string;
    type?: SegmentType | string;
    startTime?: number;
    start_time?: number;
    endTime?: number;
    end_time?: number;
    text?: string;
    narration_text?: string;
    voice?: string;
    provider?: 'elevenlabs' | 'google' | 'openai';
    speakingRate?: number;
    pitch?: number;
    volumeGainDb?: number;
    excitement?: number;
    energy?: number;
    drama?: number;
  }>;
  defaultVoice?: string;
  defaultProvider?: 'elevenlabs' | 'google' | 'openai';
  originalAudioPolicy?: OriginalAudioPolicy;
  duckingPolicy?: Partial<DuckingPolicy>;
  normalizationPolicy?: Partial<NormalizationPolicy>;
  durationPolicy?: DurationPolicy;
  captions?: Partial<CaptionPolicy>;
  metadata?: Record<string, any>;
}

export function buildVoiceoverPlan(params: BuildPlanParams): VoiceoverPlan {
  const planId = params.id || crypto.randomUUID();
  const targetDuration = Math.max(1, Number(params.targetDuration) || 30);

  const cleanSegments: VoiceoverSegment[] = (params.segments || []).map((s, idx) => {
    const rawStart = s.startTime ?? s.start_time ?? 0;
    const rawEnd = s.endTime ?? s.end_time ?? (rawStart + 5);
    const startTime = Math.max(0, Number(rawStart));
    const endTime = Math.max(startTime + 0.5, Number(rawEnd));
    const text = (s.text ?? s.narration_text ?? '').trim();
    const type = (s.type as SegmentType) || 'narration';

    return {
      id: s.id || `seg-${idx + 1}-${crypto.randomUUID().slice(0, 8)}`,
      type,
      startTime,
      endTime,
      text,
      voice: s.voice || params.defaultVoice,
      provider: s.provider || params.defaultProvider || 'elevenlabs',
      speakingRate: s.speakingRate ?? 1.0,
      pitch: s.pitch ?? 0,
      volumeGainDb: s.volumeGainDb ?? 0,
      excitement: s.excitement,
      energy: s.energy,
      drama: s.drama,
    };
  }).filter(s => s.text.length > 0);

  // Sort chronologically by startTime
  cleanSegments.sort((a, b) => a.startTime - b.startTime);

  return {
    version: '1.0',
    id: planId,
    sourceClipId: params.sourceClipId,
    sourceVideoUrl: params.sourceVideoUrl,
    targetDuration,
    timeline: {
      segments: cleanSegments,
      totalDuration: targetDuration,
    },
    originalAudioPolicy: params.originalAudioPolicy || 'duck',
    duckingPolicy: {
      duckLevelDb: params.duckingPolicy?.duckLevelDb ?? -14,
      attackMs: params.duckingPolicy?.attackMs ?? 25,
      releaseMs: params.duckingPolicy?.releaseMs ?? 250,
    },
    normalizationPolicy: {
      enabled: params.normalizationPolicy?.enabled ?? true,
      targetLUFS: params.normalizationPolicy?.targetLUFS ?? -16,
      truePeakDb: params.normalizationPolicy?.truePeakDb ?? -1.5,
    },
    durationPolicy: params.durationPolicy || 'clamp_to_video',
    captions: params.captions || { enabled: false, preset: 'submagic' },
    outputFormat: {
      audioCodec: 'aac',
      audioBitrate: '192k',
      sampleRate: 48000,
    },
    metadata: params.metadata || {},
  };
}

export function validateVoiceoverPlan(plan: VoiceoverPlan): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!plan.id) errors.push('Plan ID is required.');
  if (!plan.sourceClipId) errors.push('sourceClipId is required.');
  if (plan.targetDuration <= 0) errors.push('targetDuration must be greater than 0.');
  if (!plan.timeline || !Array.isArray(plan.timeline.segments)) {
    errors.push('Timeline segments array is required.');
  } else if (plan.timeline.segments.length === 0) {
    errors.push('Timeline must contain at least one segment with text.');
  }

  for (const [idx, seg] of (plan.timeline?.segments || []).entries()) {
    if (!seg.text || seg.text.trim().length === 0) {
      errors.push(`Segment #${idx + 1} (${seg.id}) has empty text.`);
    }
    if (seg.startTime < 0) {
      errors.push(`Segment #${idx + 1} (${seg.id}) startTime cannot be negative.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parses alternating two-speaker dialogue scripts into chronologically timed VoiceoverSegments.
 * Recognizes [Play-by-Play] vs [Analyst] or [Speaker 1] vs [Speaker 2] turn indicators.
 */
export function parseDuoCommentary(
  dialogueText: string,
  totalDuration: number,
  options?: {
    voiceA?: string;
    voiceB?: string;
    providerA?: 'elevenlabs' | 'google' | 'openai';
    providerB?: 'elevenlabs' | 'google' | 'openai';
  }
): VoiceoverSegment[] {
  const lines = dialogueText
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) return [];

  interface ParsedTurn {
    speaker: 'A' | 'B';
    text: string;
    wordCount: number;
  }

  const turns: ParsedTurn[] = [];
  let currentSpeaker: 'A' | 'B' = 'A';

  for (const line of lines) {
    let text = line;
    let speaker = currentSpeaker;

    if (/^\[?(Play-by-Play|Announcer|Speaker\s*1)\]?:?/i.test(line)) {
      speaker = 'A';
      text = line.replace(/^\[?(Play-by-Play|Announcer|Speaker\s*1)\]?:?\s*/i, '');
    } else if (/^\[?(Analyst|Color|Speaker\s*2)\]?:?/i.test(line)) {
      speaker = 'B';
      text = line.replace(/^\[?(Analyst|Color|Speaker\s*2)\]?:?\s*/i, '');
    } else {
      // Toggle if not prefixed
      speaker = currentSpeaker === 'A' ? 'B' : 'A';
    }

    text = text.trim();
    if (text.length > 0) {
      turns.push({
        speaker,
        text,
        wordCount: text.split(/\s+/).length,
      });
      currentSpeaker = speaker === 'A' ? 'B' : 'A';
    }
  }

  const totalWords = turns.reduce((acc, t) => acc + t.wordCount, 0) || 1;
  const segments: VoiceoverSegment[] = [];
  let currentTime = 0;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const turnDuration = Math.max(1.5, (turn.wordCount / totalWords) * totalDuration);
    const startTime = Number(currentTime.toFixed(2));
    const endTime = Number(Math.min(totalDuration, startTime + turnDuration).toFixed(2));

    const isA = turn.speaker === 'A';
    segments.push({
      id: `duo-${i + 1}-${turn.speaker.toLowerCase()}`,
      type: isA ? 'narration' : 'transition',
      startTime,
      endTime,
      text: turn.text,
      voice: isA ? options?.voiceA : (options?.voiceB || options?.voiceA),
      provider: isA ? (options?.providerA || 'elevenlabs') : (options?.providerB || options?.providerA || 'elevenlabs'),
      speakingRate: isA ? 1.05 : 0.95,
      excitement: isA ? 0.85 : 0.6,
      energy: isA ? 0.8 : 0.65,
      drama: isA ? 0.5 : 0.7,
    });

    currentTime = endTime + 0.2; // 200ms natural conversational pause
  }

  return segments;
}
