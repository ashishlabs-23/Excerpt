import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import { VideoProcessor } from "./videoProcessor";
import { TranscriptionCircuitBreaker } from "./TranscriptionCircuitBreaker";

const processor = new VideoProcessor();

// Shared circuit breaker — singleton for the process
const circuitBreaker = TranscriptionCircuitBreaker.getInstance();

export interface WordInfo {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

/**
 * Structured telemetry for a single Whisper API call.
 * Persisted to job.payload.transcription_telemetry by the caller.
 */
export interface TranscriptionCallTelemetry {
  provider: 'groq';
  model: string;
  audioPath: string;
  audioDurationEstimatedSec?: number;
  requestStartedAt: string;
  requestCompletedAt: string | null;
  durationMs: number;
  outcome: 'success' | 'TRANSCRIPTION_TIMEOUT' | 'WORKER_SHUTDOWN' | 'WHISPER_HTTP_ERROR' | 'WHISPER_UNAVAILABLE' | 'CIRCUIT_OPEN';
  httpStatus: number | null;
  providerRequestId: string | null;
  retryable: boolean;
  circuitBreakerState: string;
}

export interface TranscriptionResult {
  text: string;
  segments: any[];
  words?: WordInfo[];
  /** Attached by _transcribeChunk for caller persistence */
  telemetry?: TranscriptionCallTelemetry;
}

/**
 * Abort signal reason codes — distinguish shutdown from timeout.
 * Pass as signal.reason when aborting so catch blocks can read it.
 */
export const ABORT_REASON = {
  TIMEOUT: 'TRANSCRIPTION_TIMEOUT',
  WORKER_SHUTDOWN: 'WORKER_SHUTDOWN',
} as const;

export class TranscriptionService {
  private _groq: Groq | null = null;

  private get groq(): Groq {
    if (!this._groq) {
      this._groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });
    }
    return this._groq;
  }

  /**
   * Transcribes a video file. Uses 'Neural Chunking' for files > 20 MB.
   * Shared circuit breaker protects against Groq outages at the process level.
   */
  async transcribe(videoPath: string): Promise<TranscriptionResult> {
    const transcribeStart = Date.now();
    const audioPath = videoPath.replace(/\.[^.]+$/, '_audio.mp3');
    console.log(`[TranscriptionService]: [AUDIO_EXTRACT_START] ts=${new Date().toISOString()}`);
    await processor.extractAudio(videoPath, audioPath);
    const audioExtractMs = Date.now() - transcribeStart;
    console.log(`[TranscriptionService]: [AUDIO_EXTRACT_DONE] elapsedMs=${audioExtractMs} ts=${new Date().toISOString()}`);

    const audioSize = fs.statSync(audioPath).size;
    const sizeMB = audioSize / 1024 / 1024;
    console.log(`[TranscriptionService]: Audio weight: ${sizeMB.toFixed(2)} MB`);

    const MAX_SIZE_MB = 20; // Safe margin for 25 MB Groq limit
    if (sizeMB < MAX_SIZE_MB) {
      return this._transcribeChunk(audioPath);
    }

    console.log(`[TranscriptionService]: 🧩 Neural Chunking Active -> Splitting ${sizeMB.toFixed(1)}MB audio...`);
    const chunks = await this._splitAudio(audioPath);
    console.log(`[TranscriptionService]: 🧩 Found ${chunks.length} chunks. Synchronizing...`);

    let fullText = '';
    let allSegments: any[] = [];
    let allWords: any[] = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(`[TranscriptionService]: 📡 Neural Decode -> Chunk ${i + 1}/${chunks.length}...`);
      const result = await this._transcribeChunk(chunks[i]);

      const chunkStart = i * 600;
      const chunkEnd = chunkStart + 600;

      const filteredSegments = result.segments.filter(seg => {
        const absoluteStart = seg.start + chunkStart;
        return i === chunks.length - 1 || absoluteStart < chunkEnd;
      });

      const offsetSegments = filteredSegments.map(seg => ({
        ...seg,
        start: seg.start + chunkStart,
        end: seg.end + chunkStart,
      }));

      const filteredWords = (result.words || []).filter(w => {
        const absoluteStart = w.start + chunkStart;
        return i === chunks.length - 1 || absoluteStart < chunkEnd;
      });

      const offsetWords = filteredWords.map(w => ({
        ...w,
        start: w.start + chunkStart,
        end: w.end + chunkStart,
      }));

      allSegments.push(...offsetSegments);
      allWords.push(...offsetWords);
      const chunkText = filteredSegments.map(seg => seg.text).join(' ');
      fullText += (fullText ? ' ' : '') + chunkText;

      try { fs.unlinkSync(chunks[i]); } catch {}
    }

    try { fs.unlinkSync(audioPath); } catch {}

    return { text: fullText, segments: allSegments, words: allWords };
  }

  private async _splitAudio(inputPath: string): Promise<string[]> {
    const tempDir = path.dirname(inputPath);
    const chunkDuration = 600; // 10 minutes
    const overlap = 10;

    const duration = await processor.getVideoDuration(inputPath);
    const chunks: string[] = [];

    let ffmpeg = 'ffmpeg';
    const envPath = process.env.FFMPEG_PATH?.trim();
    if (envPath && fs.existsSync(envPath)) {
      ffmpeg = envPath;
    } else {
      const localPath = path.join(__dirname, '..', '..', 'bin', 'ffmpeg.exe');
      if (fs.existsSync(localPath)) ffmpeg = localPath;
    }

    const { execFile } = require('child_process');

    for (let start = 0; start < duration; start += chunkDuration) {
      const chunkPath = path.join(tempDir, `chunk_${Math.floor(start / chunkDuration).toString().padStart(3, '0')}.mp3`);
      const actualDuration = Math.min(chunkDuration + overlap, duration - start);

      await new Promise<void>((resolve, reject) => {
        const args = ['-ss', start.toString(), '-i', inputPath, '-t', actualDuration.toString(), '-c', 'copy', '-y', chunkPath];
        execFile(ffmpeg, args, (error: any) => {
          if (error) reject(error);
          else resolve();
        });
      });
      chunks.push(chunkPath);
    }

    return chunks;
  }

  /**
   * Sends one audio chunk to the Groq Whisper API.
   * Checks the circuit breaker before calling and records the outcome after.
   * Throws structured errors with .transcriptionErrorCode for the worker catch.
   */
  private async _transcribeChunk(audioPath: string): Promise<TranscriptionResult> {
    const chunkStart = Date.now();
    const requestStartedAt = new Date().toISOString();
    const cbStatus = circuitBreaker.getStatus();

    console.log(`[TranscriptionService]: [WHISPER_REQUEST_START] audioPath=${path.basename(audioPath)} circuitState=${cbStatus.state} ts=${requestStartedAt}`);

    // ── Circuit breaker check ──────────────────────────────────────────────
    if (!circuitBreaker.canRequest()) {
      const err = new Error(`CIRCUIT_OPEN: Groq circuit breaker is OPEN after ${cbStatus.consecutiveFailures} failures. Last error: ${cbStatus.lastFailureCode}`);
      (err as any).transcriptionErrorCode = 'CIRCUIT_OPEN';
      (err as any).retryable = true; // Retry later when circuit closes
      console.warn(`[TranscriptionService]: [CIRCUIT_OPEN] Rejecting request immediately. Opens in ~${Math.round(((cbStatus.openedAt ?? 0) + 60000 - Date.now()) / 1000)}s`);
      throw err;
    }

    // ── Build request ──────────────────────────────────────────────────────
    const fileBuffer = fs.readFileSync(audioPath);
    const fileBlob = new Blob([fileBuffer], { type: 'audio/mpeg' });
    const formData = new FormData();
    formData.append("file", fileBlob, "audio.mp3");
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");
    formData.append("timestamp_granularities[]", "segment");

    // ── Timeout with distinct abort reason ────────────────────────────────
    const GROQ_TIMEOUT_MS = 90_000;
    const controller = new AbortController();
    let abortReason: string = ABORT_REASON.TIMEOUT;

    const timeoutId = setTimeout(() => {
      abortReason = ABORT_REASON.TIMEOUT;
      controller.abort(ABORT_REASON.TIMEOUT);
      console.error(`[TranscriptionService]: [WHISPER_TIMEOUT] Groq fetch aborted after ${GROQ_TIMEOUT_MS / 1000}s ts=${new Date().toISOString()}`);
    }, GROQ_TIMEOUT_MS);

    // Allow external callers (worker shutdown) to signal this controller
    // by calling transcriptionService.abortCurrentRequest(ABORT_REASON.WORKER_SHUTDOWN)
    this._activeController = controller;
    this._setAbortReason = (r: string) => { abortReason = r; };

    let response: Response;
    try {
      response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
        body: formData as any,
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      this._activeController = null;

      // Distinguish: was this our timeout, or a worker shutdown abort, or a network error?
      const isAbort = fetchErr.name === 'AbortError';
      const code = isAbort ? abortReason : 'WHISPER_UNAVAILABLE';

      const telemetry: TranscriptionCallTelemetry = {
        provider: 'groq',
        model: 'whisper-large-v3-turbo',
        audioPath: path.basename(audioPath),
        requestStartedAt,
        requestCompletedAt: new Date().toISOString(),
        durationMs: Date.now() - chunkStart,
        outcome: code as any,
        httpStatus: null,
        providerRequestId: null,
        retryable: code !== ABORT_REASON.WORKER_SHUTDOWN,
        circuitBreakerState: cbStatus.state,
      };

      console.error(`[TranscriptionService]: [WHISPER_FETCH_FAILED] code=${code} durationMs=${telemetry.durationMs}`);
      circuitBreaker.recordFailure(code);

      const structured = new Error(`${code}: ${fetchErr.message}`);
      (structured as any).transcriptionErrorCode = code;
      (structured as any).retryable = telemetry.retryable;
      (structured as any).telemetry = telemetry;
      throw structured;
    } finally {
      clearTimeout(timeoutId);
      this._activeController = null;
      this._setAbortReason = undefined;
    }

    // ── Read provider request ID from response headers ────────────────────
    const providerRequestId =
      response.headers.get('x-request-id') ||
      response.headers.get('cf-ray') ||
      response.headers.get('x-groq-request-id') ||
      null;

    const groqElapsedMs = Date.now() - chunkStart;
    console.log(`[TranscriptionService]: [WHISPER_RESPONSE] status=${response.status} elapsedMs=${groqElapsedMs} requestId=${providerRequestId ?? 'none'} ts=${new Date().toISOString()}`);

    if (!response.ok) {
      const body = await response.text();
      console.error(`[TranscriptionService]: [WHISPER_ERROR] status=${response.status} requestId=${providerRequestId} body=${body.slice(0, 300)}`);

      const code = 'WHISPER_HTTP_ERROR';
      circuitBreaker.recordFailure(code);

      const telemetry: TranscriptionCallTelemetry = {
        provider: 'groq',
        model: 'whisper-large-v3-turbo',
        audioPath: path.basename(audioPath),
        requestStartedAt,
        requestCompletedAt: new Date().toISOString(),
        durationMs: groqElapsedMs,
        outcome: code,
        httpStatus: response.status,
        providerRequestId,
        retryable: response.status !== 400,
        circuitBreakerState: cbStatus.state,
      };

      const structured = new Error(`WHISPER_HTTP_ERROR: status=${response.status} requestId=${providerRequestId} body=${body.slice(0, 200)}`);
      (structured as any).transcriptionErrorCode = code;
      (structured as any).httpStatus = response.status;
      (structured as any).retryable = telemetry.retryable;
      (structured as any).telemetry = telemetry;
      throw structured;
    }

    // ── Success path ───────────────────────────────────────────────────────
    circuitBreaker.recordSuccess(providerRequestId ?? undefined);

    const jsonResponse = await response.json() as any;
    const segments = jsonResponse.segments || [];
    const words = jsonResponse.words || [];
    const text = segments.map((seg: any) => `[${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s]: ${seg.text.trim()}`).join('\n');

    const telemetry: TranscriptionCallTelemetry = {
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      audioPath: path.basename(audioPath),
      requestStartedAt,
      requestCompletedAt: new Date().toISOString(),
      durationMs: Date.now() - chunkStart,
      outcome: 'success',
      httpStatus: response.status,
      providerRequestId,
      retryable: false,
      circuitBreakerState: 'CLOSED',
    };

    console.log(`[TranscriptionService]: [WHISPER_COMPLETE] segments=${segments.length} words=${words.length} durationMs=${telemetry.durationMs} requestId=${providerRequestId ?? 'none'} ts=${new Date().toISOString()}`);
    return { text, segments, words, telemetry };
  }

  // ── Shutdown hook ──────────────────────────────────────────────────────────
  // Call this from the worker's SIGTERM handler so in-flight Groq requests
  // are tagged WORKER_SHUTDOWN, not TRANSCRIPTION_TIMEOUT.
  private _activeController: AbortController | null = null;
  private _setAbortReason?: (r: string) => void;

  abortCurrentRequest(reason: string = ABORT_REASON.WORKER_SHUTDOWN): void {
    if (this._activeController) {
      if (this._setAbortReason) this._setAbortReason(reason);
      this._activeController.abort(reason);
      console.warn(`[TranscriptionService]: In-flight request aborted with reason=${reason}`);
    }
  }
}
