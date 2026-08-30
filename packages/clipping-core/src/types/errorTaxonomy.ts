/**
 * Canonical 14-category error taxonomy for the Excerpt pipeline.
 * Owned strictly by @excerpt/clipping-core.
 */

export enum ErrorCategory {
  // Input acquisition
  DOWNLOAD      = 'DOWNLOAD',
  AUTH          = 'AUTH',
  RATE_LIMIT    = 'RATE_LIMIT',

  // Processing
  FFMPEG        = 'FFMPEG',
  TRANSCRIPTION = 'TRANSCRIPTION',
  LLM           = 'LLM',
  BOUNDARY      = 'BOUNDARY',
  RENDER        = 'RENDER',

  // Output & Infrastructure
  UPLOAD        = 'UPLOAD',
  DATABASE      = 'DATABASE',
  QUEUE         = 'QUEUE',
  WORKER        = 'WORKER',
  TIMEOUT       = 'TIMEOUT',

  // Catch-all
  UNKNOWN       = 'UNKNOWN',
}

export interface ErrorClassification {
  category: ErrorCategory;
  summary: string;
  retryable: boolean;
  originalMessage?: string;
}

export type TimeoutType =
  | 'api_timeout'
  | 'process_timeout'
  | 'queue_timeout'
  | 'worker_timeout'
  | 'heartbeat_timeout'
  | 'storage_timeout'
  | 'render_timeout';

export interface PipelineErrorDetails {
  category: ErrorCategory;
  message: string;
  stage?: string;
  component?: string;
  provider?: string;
  retryable: boolean;
  httpStatus?: number;
  exitCode?: number;
  requestId?: string;
  jobId?: string;
  clipId?: string;
  durationMs?: number;
  attempt?: number;
  rootCause?: string;
  timestamp: string;
  timeoutType?: TimeoutType;
  metadata?: Record<string, any>;
  suggestedFix?: string;
}

import { PipelineError } from '../errors/PipelineError';
export { PipelineError };

export function getSuggestedFix(category: ErrorCategory, timeoutType?: TimeoutType): string {
  if (timeoutType) {
    switch (timeoutType) {
      case 'api_timeout':
        return 'Check external API connectivity or provider status page. The API endpoint took too long to respond.';
      case 'process_timeout':
        return 'Local process (e.g. FFmpeg) took too long. Check server CPU load or increase hardware resource allocation.';
      case 'storage_timeout':
        return 'Cloud storage (B2/S3) upload or download timed out. Check network bandwidth and storage credentials.';
      default:
        return 'Stage execution timed out. Consider reducing input video size or retrying.';
    }
  }

  switch (category) {
    case ErrorCategory.RATE_LIMIT:
      return 'API quota exceeded. Rotate your API keys or wait for quota reset before retrying.';
    case ErrorCategory.AUTH:
      return 'Authentication failed or content is private/restricted. Verify video availability or supply valid cookies.';
    case ErrorCategory.DOWNLOAD:
      return 'Failed to fetch source media. Verify the URL is publicly accessible or try direct file upload.';
    case ErrorCategory.FFMPEG:
      return 'Video encoding or clipping failed. Ensure input video file is not corrupted.';
    case ErrorCategory.LLM:
      return 'AI model response could not be parsed or failed. Check model parameters or prompt formatting.';
    case ErrorCategory.TRANSCRIPTION:
      return 'Whisper/Groq audio transcription failed. Verify input audio track is clear and uncorrupted.';
    default:
      return 'An unhandled pipeline error occurred. Check stage logs for full details.';
  }
}

interface PatternRule {
  patterns: RegExp[];
  category: ErrorCategory;
  summary: string;
  retryable: boolean;
}

const PATTERN_RULES: PatternRule[] = [
  // TIMEOUT (highest priority)
  {
    patterns: [
      /timed?\s*out/i,
      /\[timeout\]/i,
      /operation timed out/i,
      /etimedout/i,
      /econnaborted/i,
      /_timeout/i,
      /timeout:/i,
      /exceeded.*timeout/i,
      /deadline exceeded/i,
    ],
    category: ErrorCategory.TIMEOUT,
    summary: 'Operation timed out',
    retryable: true,
  },

  // RATE_LIMIT
  {
    patterns: [
      /http error 429/i,
      /too many requests/i,
      /rate.?limit/i,
      /resource exhausted/i,
      /quota exceeded/i,
      /\b429\b/,
    ],
    category: ErrorCategory.RATE_LIMIT,
    summary: 'Rate limit exceeded',
    retryable: true,
  },

  // AUTH
  {
    patterns: [
      /sign in to confirm/i,
      /bot.{0,20}detection/i,
      /private video/i,
      /members.?only/i,
      /age.?restricted/i,
      /sign in to verify your age/i,
      /login required/i,
      /authentication failed/i,
      /unauthorized/i,
      /\bforbidden\b/i,
      /\b403\b/,
      /\b401\b/,
    ],
    category: ErrorCategory.AUTH,
    summary: 'Authentication or authorization failure',
    retryable: false,
  },

  // DOWNLOAD
  {
    patterns: [
      /video unavailable/i,
      /this video isn.t available/i,
      /geo.?restricted/i,
      /econnreset/i,
      /network is unreachable/i,
      /failed to download/i,
      /ytdlp/i,
      /yt.?dlp/i,
      /cobalt/i,
      /no video formats/i,
      /unable to download/i,
      /download.{0,30}failed/i,
    ],
    category: ErrorCategory.DOWNLOAD,
    summary: 'Video download failed',
    retryable: true,
  },

  // FFMPEG
  {
    patterns: [
      /ffmpeg/i,
      /ffprobe/i,
      /invalid data found/i,
      /moov atom not found/i,
      /no such file or directory/i,
      /invalid codec/i,
      /output file is empty/i,
      /conversion failed/i,
      /\bencoder\b/i,
      /\bdecoder\b/i,
      /codec not found/i,
      /av_interleaved_write_frame/i,
    ],
    category: ErrorCategory.FFMPEG,
    summary: 'FFmpeg processing failure',
    retryable: false,
  },

  // LLM
  {
    patterns: [
      /0 clips/i,
      /ai returned 0/i,
      /ai_health_check/i,
      /gemini/i,
      /openai/i,
      /groq(?!.*audio)/i,
      /\bllm\b/i,
      /\bllama\b/i,
      /anthropic/i,
      /ai service/i,
      /generative/i,
      /model.*failed/i,
      /failed.*model/i,
      /parse.*json/i,
      /json.*parse/i,
    ],
    category: ErrorCategory.LLM,
    summary: 'LLM inference or parsing failure',
    retryable: true,
  },

  // TRANSCRIPTION
  {
    patterns: [
      /transcription/i,
      /whisper/i,
      /groq.*audio/i,
      /audio.*groq/i,
      /transcript/i,
      /speech.?to.?text/i,
      /audio extraction/i,
      /audio_extract/i,
      /whisper_unavailable/i,
      /whisper_http_error/i,
      /circuit.?open/i,
    ],
    category: ErrorCategory.TRANSCRIPTION,
    summary: 'Transcription service failure',
    retryable: true,
  },

  // BOUNDARY
  {
    patterns: [
      /boundary/i,
      /candidate.*range/i,
      /story.?arc/i,
      /segment.*boundary/i,
      /snap.*segment/i,
      /clip.*duration.*exceed/i,
      /invalid.*timestamp/i,
    ],
    category: ErrorCategory.BOUNDARY,
    summary: 'Boundary or candidate planning failure',
    retryable: false,
  },

  // DATABASE
  {
    patterns: [
      /supabase/i,
      /postgres/i,
      /\bpgrst\b/i,
      /schema cache/i,
      /relation.*does not exist/i,
      /column.*does not exist/i,
      /db (update|insert|error)/i,
      /insert.*failed/i,
      /update.*failed/i,
      /\bdatabase\b/i,
    ],
    category: ErrorCategory.DATABASE,
    summary: 'Database operation failure',
    retryable: true,
  },

  // QUEUE
  {
    patterns: [
      /enqueue/i,
      /redis/i,
      /bullmq?/i,
      /job.*queue/i,
      /\bqueue\b/i,
    ],
    category: ErrorCategory.QUEUE,
    summary: 'Job queue failure',
    retryable: true,
  },

  // RENDER
  {
    patterns: [
      /render_job/i,
      /renderworker/i,
      /caption.*render/i,
      /render.*caption/i,
      /thumbnail.*extract/i,
      /thumbnail.*fail/i,
      /\brender\b/i,
    ],
    category: ErrorCategory.RENDER,
    summary: 'Render or thumbnail generation failure',
    retryable: true,
  },

  // UPLOAD
  {
    patterns: [
      /upload/i,
      /backblaze/i,
      /b2.*upload/i,
      /upload.*b2/i,
      /s3.*put/i,
      /storage.*upload/i,
      /upload.*failed/i,
    ],
    category: ErrorCategory.UPLOAD,
    summary: 'Storage upload failure',
    retryable: true,
  },

  // WORKER
  {
    patterns: [
      /worker_shutdown/i,
      /\boom\b/i,
      /out of memory/i,
      /process.?killed/i,
      /sigkill/i,
      /sigterm/i,
      /\bspawn\b/i,
      /child.?process/i,
      /\bworker\b/i,
    ],
    category: ErrorCategory.WORKER,
    summary: 'Worker process failure',
    retryable: true,
  },
];

export function classifyPipelineError(
  error: unknown,
  hint?: string,
): ErrorClassification {
  if (error instanceof PipelineError) {
    return {
      category: error.category,
      summary: error.message,
      retryable: error.retryable,
      originalMessage: error.message,
    };
  }

  const parts: string[] = [];

  if (error instanceof Error) {
    parts.push(error.message);
    const anyErr = error as any;
    if (anyErr.stderr) parts.push(String(anyErr.stderr));
    if (anyErr.code) parts.push(String(anyErr.code));
    if (anyErr.signal) parts.push(String(anyErr.signal));
  } else if (typeof error === 'string') {
    parts.push(error);
  } else if (error !== null && error !== undefined) {
    parts.push(String(error));
  }

  if (hint) {
    parts.unshift(hint);
  }

  const haystack = parts.join(' ').toLowerCase();
  const originalMessage = error instanceof Error ? error.message : String(error ?? '');

  for (const rule of PATTERN_RULES) {
    if (rule.patterns.some(pattern => pattern.test(haystack))) {
      return {
        category: rule.category,
        summary: rule.summary,
        retryable: rule.retryable,
        originalMessage,
      };
    }
  }

  return {
    category: ErrorCategory.UNKNOWN,
    summary: `Unclassified error: ${originalMessage.slice(0, 120)}`,
    retryable: false,
    originalMessage,
  };
}
