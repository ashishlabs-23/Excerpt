import fs from 'fs';
import path from 'path';
import https from 'https';
import { execFile } from 'child_process';
import { getBinaryPath } from './videoProcessor';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type VoiceProvider = 'google' | 'openai' | 'elevenlabs';
export type VoiceGender = 'NEUTRAL' | 'FEMALE' | 'MALE';
export type AudioEncoding = 'MP3' | 'LINEAR16' | 'OGG_OPUS';

export interface VoiceConfig {
  provider?: VoiceProvider;
  voiceId?: string;       // Google: 'en-US-Neural2-D', ElevenLabs: voice ID
  languageCode?: string;  // Google: 'en-US'
  gender?: VoiceGender;
  speakingRate?: number;  // 0.25 – 4.0 (Google), 0.5 – 2.0 (others)
  pitch?: number;         // -20 to +20 semitones (Google)
  volumeGainDb?: number;  // -96 to +16 dB (Google)
  sampleRateHz?: number;  // 8000 – 48000
}

export interface SynthesisResult {
  audioPath: string;
  provider: VoiceProvider;
  durationMs?: number;
  charsUsed: number;
}

export interface ProviderStatus {
  provider: VoiceProvider;
  healthy: boolean;
  degradedUntil: number; // epoch ms, 0 if healthy
  consecutiveFailures: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CIRCUIT_BREAKER_THRESHOLD = 3;         // failures before degraded
const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60000; // 5 minutes
const MAX_NARRATION_CHARS = 500;

// Google Neural2 voices — best quality per gender
const GOOGLE_DEFAULT_VOICES: Record<VoiceGender, string> = {
  NEUTRAL: 'en-US-Neural2-D',
  FEMALE: 'en-US-Neural2-F',
  MALE: 'en-US-Neural2-D',
};

// ─────────────────────────────────────────────────────────────────────────────
// Circuit Breaker State
// ─────────────────────────────────────────────────────────────────────────────

const providerState: Record<VoiceProvider, ProviderStatus> = {
  google: { provider: 'google', healthy: true, degradedUntil: 0, consecutiveFailures: 0 },
  openai: { provider: 'openai', healthy: true, degradedUntil: 0, consecutiveFailures: 0 },
  elevenlabs: { provider: 'elevenlabs', healthy: true, degradedUntil: 0, consecutiveFailures: 0 },
};

function isProviderAvailable(provider: VoiceProvider): boolean {
  const state = providerState[provider];
  if (state.degradedUntil > Date.now()) return false;
  if (!state.healthy && state.degradedUntil <= Date.now()) {
    // Auto-recover after cooldown
    state.healthy = true;
    state.consecutiveFailures = 0;
    state.degradedUntil = 0;
    console.log(`[VoiceoverService]: Provider ${provider} auto-recovered from circuit breaker.`);
  }
  return state.healthy;
}

function recordProviderFailure(provider: VoiceProvider, error: string): void {
  const state = providerState[provider];
  state.consecutiveFailures++;
  console.warn(`[VoiceoverService]: Provider ${provider} failure #${state.consecutiveFailures}: ${error}`);
  if (state.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.healthy = false;
    state.degradedUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
    console.error(`[VoiceoverService]: Circuit breaker OPEN for ${provider}. Will retry after ${new Date(state.degradedUntil).toISOString()}`);
  }
}

function recordProviderSuccess(provider: VoiceProvider): void {
  const state = providerState[provider];
  state.consecutiveFailures = 0;
  state.healthy = true;
  state.degradedUntil = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input Sanitization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitizes narration text to prevent prompt injection and malformed TTS input.
 * - Strips XML/HTML tags (SSML injection prevention)
 * - Truncates to MAX_NARRATION_CHARS
 * - Collapses excessive whitespace
 */
export function sanitizeNarrationText(text: string): string {
  if (typeof text !== 'string') throw new Error('Narration text must be a string.');

  let sanitized = text
    .replace(/<[^>]*>/g, '')           // strip any XML/HTML tags
    .replace(/[{}[\]\\]/g, '')         // strip injection-prone chars
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim();

  if (sanitized.length === 0) throw new Error('Narration text is empty after sanitization.');
  if (sanitized.length > MAX_NARRATION_CHARS) {
    sanitized = sanitized.slice(0, MAX_NARRATION_CHARS);
    console.warn('[VoiceoverService]: Narration text truncated to max chars.');
  }

  return sanitized;
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Cloud TTS
// ─────────────────────────────────────────────────────────────────────────────

async function synthesizeWithGoogle(
  text: string,
  config: VoiceConfig,
  outputPath: string
): Promise<void> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  const isKeyValidFormat = apiKey && apiKey.startsWith('AIzaSy');

  if (isKeyValidFormat) {
    try {
      const gender = config.gender || 'NEUTRAL';
      const voiceName = config.voiceId || GOOGLE_DEFAULT_VOICES[gender];
      const languageCode = config.languageCode || 'en-US';

      const requestBody = {
        input: { text },
        voice: {
          languageCode,
          name: voiceName,
          ssmlGender: gender,
        },
        audioConfig: {
          audioEncoding: 'MP3' as AudioEncoding,
          speakingRate: config.speakingRate ?? 1.0,
          pitch: config.pitch ?? 0,
          volumeGainDb: config.volumeGainDb ?? 0,
          sampleRateHertz: config.sampleRateHz ?? 44100,
          effectsProfileId: ['headphone-class-device'],
        },
      };

      const endpoint = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = (await response.json()) as { audioContent: string };
        if (data.audioContent) {
          const audioBuffer = Buffer.from(data.audioContent, 'base64');
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, audioBuffer);
          return;
        }
      }

      const errBody = await response.text().catch(() => 'unknown error');
      console.warn(`[VoiceoverService]: Google Cloud TTS REST API failed (status ${response.status}: ${errBody}). Falling back to unofficial google-tts-api package.`);
    } catch (e: any) {
      console.warn(`[VoiceoverService]: Google Cloud TTS REST API error: ${e.message}. Falling back to unofficial google-tts-api package.`);
    }
  } else {
    console.warn('[VoiceoverService]: GOOGLE_TTS_API_KEY is missing or invalid format (expected AIzaSy...). Using unofficial google-tts-api package.');
  }

  // Fallback to unofficial google-tts-api
  const googleTTS = require('google-tts-api');
  const results = await googleTTS.getAllAudioBase64(text, {
    lang: config.languageCode?.split('-')[0] || 'en',
    slow: config.speakingRate && config.speakingRate < 1 ? true : false,
    host: 'https://translate.google.com',
    splitPunct: ',.?',
  });

  const buffers = results.map((r: any) => Buffer.from(r.base64, 'base64'));
  const finalBuffer = Buffer.concat(buffers);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, finalBuffer);
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI TTS (fallback)
// ─────────────────────────────────────────────────────────────────────────────

async function synthesizeWithOpenAI(
  text: string,
  config: VoiceConfig,
  outputPath: string
): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key') {
    throw new Error('OPENAI_API_KEY not configured.');
  }

  // Map gender to OpenAI voice
  const voiceMap: Record<VoiceGender, string> = {
    NEUTRAL: 'onyx',
    MALE: 'onyx',
    FEMALE: 'nova',
  };
  const voice = config.voiceId || voiceMap[config.gender || 'NEUTRAL'];
  const speed = config.speakingRate ?? 1.0;

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      input: text,
      voice,
      speed: Math.max(0.25, Math.min(4.0, speed)),
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown');
    throw new Error(`OpenAI TTS error ${response.status}: ${err}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
}

// ─────────────────────────────────────────────────────────────────────────────
// ElevenLabs TTS (premium tier, optional)
// ─────────────────────────────────────────────────────────────────────────────

async function synthesizeWithElevenLabs(
  text: string,
  config: VoiceConfig,
  outputPath: string
): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured.');

  const voiceId = config.voiceId || 'pNInz6obpgDQGcFmaJgB'; // Adam — standard voice, works on free tier

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown');
    throw new Error(`ElevenLabs TTS error ${response.status}: ${err}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Cascade
// ─────────────────────────────────────────────────────────────────────────────

const PROVIDER_CASCADE: VoiceProvider[] = ['elevenlabs', 'google', 'openai'];

function resolveProviderCascade(preferred?: VoiceProvider): VoiceProvider[] {
  if (!preferred) return PROVIDER_CASCADE;
  return [preferred, ...PROVIDER_CASCADE.filter(p => p !== preferred)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export class VoiceoverService {
  private static instance: VoiceoverService;

  static getInstance(): VoiceoverService {
    if (!VoiceoverService.instance) {
      VoiceoverService.instance = new VoiceoverService();
    }
    return VoiceoverService.instance;
  }

  /**
   * Main synthesis entry point. Tries providers in cascade order.
   * Returns the path of the generated MP3 audio file.
   */
  async synthesize(
    rawText: string,
    config: VoiceConfig,
    outputDir: string,
    segmentId: string
  ): Promise<SynthesisResult> {
    const text = sanitizeNarrationText(rawText);
    const outputPath = path.join(outputDir, `vo_${segmentId}.mp3`);

    const preferred = config.provider ||
      (process.env.VOICEOVER_PRIMARY_PROVIDER as VoiceProvider | undefined) ||
      'google';
    const cascade = resolveProviderCascade(preferred);

    let lastError: Error | null = null;

    for (const provider of cascade) {
      if (!isProviderAvailable(provider)) {
        console.log(`[VoiceoverService]: Skipping ${provider} — circuit breaker OPEN.`);
        continue;
      }

      console.log(`[VoiceoverService]: Trying provider ${provider} for segment ${segmentId}...`);
      const startMs = Date.now();

      try {
        switch (provider) {
          case 'google':
            await synthesizeWithGoogle(text, config, outputPath);
            break;
          case 'openai':
            await synthesizeWithOpenAI(text, config, outputPath);
            break;
          case 'elevenlabs':
            await synthesizeWithElevenLabs(text, config, outputPath);
            break;
        }

        recordProviderSuccess(provider);
        const elapsed = Date.now() - startMs;
        console.log(`[VoiceoverService]: Synthesis SUCCESS via ${provider} in ${elapsed}ms`);

        return {
          audioPath: outputPath,
          provider,
          durationMs: elapsed,
          charsUsed: text.length,
        };
      } catch (err: any) {
        lastError = err;
        recordProviderFailure(provider, err.message);
        console.warn(`[VoiceoverService]: Provider ${provider} failed: ${err.message}. Trying next...`);
      }
    }

    throw new Error(
      `All TTS providers exhausted. Last error: ${lastError?.message || 'unknown'}`
    );
  }

  /**
   * Returns available voices for the given provider.
   * Google TTS — returns a curated list of Neural2 voices.
   */
  async getAvailableVoices(provider: VoiceProvider = 'google'): Promise<any[]> {
    if (provider === 'google') {
      return [
        { id: 'en-US-Neural2-D', name: 'Neural2 - Adam', gender: 'MALE', lang: 'en-US' },
        { id: 'en-US-Neural2-F', name: 'Neural2 - Sarah', gender: 'FEMALE', lang: 'en-US' },
        { id: 'en-US-Neural2-A', name: 'Neural2 - Amy', gender: 'FEMALE', lang: 'en-US' },
        { id: 'en-US-Neural2-C', name: 'Neural2 - Chris', gender: 'FEMALE', lang: 'en-US' },
        { id: 'en-US-Neural2-E', name: 'Neural2 - Elena', gender: 'FEMALE', lang: 'en-US' },
        { id: 'en-US-Neural2-G', name: 'Neural2 - Grace', gender: 'FEMALE', lang: 'en-US' },
        { id: 'en-US-Neural2-H', name: 'Neural2 - Henry', gender: 'MALE', lang: 'en-US' },
        { id: 'en-US-Neural2-I', name: 'Neural2 - Ivan', gender: 'MALE', lang: 'en-US' },
        { id: 'en-US-Neural2-J', name: 'Neural2 - James', gender: 'MALE', lang: 'en-US' },
        { id: 'en-GB-Neural2-A', name: 'Neural2 - Ava (British)', gender: 'FEMALE', lang: 'en-GB' },
        { id: 'en-GB-Neural2-B', name: 'Neural2 - Ben (British)', gender: 'MALE', lang: 'en-GB' },
        { id: 'en-IN-Neural2-A', name: 'Neural2 - Aria (Indian)', gender: 'FEMALE', lang: 'en-IN' },
        { id: 'en-IN-Neural2-B', name: 'Neural2 - Brahm (Indian)', gender: 'MALE', lang: 'en-IN' },
      ];
    }
    if (provider === 'openai') {
      return [
        { id: 'alloy', name: 'Alloy', gender: 'NEUTRAL' },
        { id: 'echo', name: 'Echo', gender: 'MALE' },
        { id: 'fable', name: 'Fable', gender: 'NEUTRAL' },
        { id: 'onyx', name: 'Onyx', gender: 'MALE' },
        { id: 'nova', name: 'Nova', gender: 'FEMALE' },
        { id: 'shimmer', name: 'Shimmer', gender: 'FEMALE' },
      ];
    }
    if (provider === 'elevenlabs') {
      const standardVoices = [
        { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Standard)', gender: 'MALE', description: 'Deep narration' },
        { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Standard)', gender: 'FEMALE', description: 'Warm narration' },
        { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella (Standard)', gender: 'FEMALE', description: 'Expressive audio' },
        { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (Standard)', gender: 'MALE', description: 'Professional voice' },
        { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Dom (Standard)', gender: 'MALE', description: 'Dynamic speaker' },
      ];

      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (apiKey) {
        try {
          const response = await fetch('https://api.elevenlabs.io/v1/voices', {
            headers: { 'xi-api-key': apiKey }
          });
          if (response.ok) {
            const data = await response.json() as { voices: any[] };
            const cloned = (data.voices || [])
              .filter(v => v.category === 'cloned')
              .map(v => ({
                id: v.voice_id,
                name: `${v.name} (Cloned)`,
                gender: v.labels?.gender?.toUpperCase() || 'NEUTRAL',
                description: v.description || 'Cloned custom voice'
              }));
            return [...cloned, ...standardVoices];
          }
        } catch (e: any) {
          console.warn('[VoiceoverService]: Failed to fetch ElevenLabs custom voices:', e.message);
        }
      }
      return standardVoices;
    }
    return [];
  }

  /** Returns provider health status for monitoring */
  getProviderStatus(): Record<VoiceProvider, Omit<ProviderStatus, 'provider'>> {
    return Object.fromEntries(
      Object.entries(providerState).map(([p, s]) => [
        p,
        { healthy: s.healthy, degradedUntil: s.degradedUntil, consecutiveFailures: s.consecutiveFailures },
      ])
    ) as any;
  }
}
