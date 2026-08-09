/**
 * Regression tests for the canonical error classifier.
 *
 * Acceptance criteria:
 *   - Every one of the 14 canonical categories is testable via at least 2 distinct error messages.
 *   - UNKNOWN is only emitted for truly unrecognised inputs.
 *   - classifyError() shim is backwards-compatible.
 *   - retryable metadata is correct for every category.
 */

import {
  classifyPipelineError,
  classifyError,
  ErrorCategory,
} from '../utils/errorClassifier';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function errWith(message: string, extra?: Record<string, unknown>): Error {
  return Object.assign(new Error(message), extra ?? {});
}

// ---------------------------------------------------------------------------
// TIMEOUT
// ---------------------------------------------------------------------------

describe('ErrorCategory.TIMEOUT', () => {
  it('classifies generic timed out messages', () => {
    expect(classifyPipelineError(errWith('Operation timed out after 30000ms')).category)
      .toBe(ErrorCategory.TIMEOUT);
  });

  it('classifies [Timeout] tagged labels', () => {
    expect(classifyPipelineError(errWith('[Timeout] Gemini (Attempt 3) timed out after 30000ms')).category)
      .toBe(ErrorCategory.TIMEOUT);
  });

  it('classifies TRANSCRIPTION_TIMEOUT error code', () => {
    expect(classifyPipelineError(errWith('TRANSCRIPTION_TIMEOUT: graphBuilderService.build exceeded 300s')).category)
      .toBe(ErrorCategory.TIMEOUT);
  });

  it('marks TIMEOUT as retryable', () => {
    expect(classifyPipelineError(errWith('Operation timed out')).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RATE_LIMIT
// ---------------------------------------------------------------------------

describe('ErrorCategory.RATE_LIMIT', () => {
  it('classifies HTTP 429 in stderr', () => {
    expect(classifyPipelineError(errWith('Groq returned HTTP error 429')).category)
      .toBe(ErrorCategory.RATE_LIMIT);
  });

  it('classifies quota exceeded', () => {
    expect(classifyPipelineError(errWith('Resource exhausted: quota exceeded')).category)
      .toBe(ErrorCategory.RATE_LIMIT);
  });

  it('marks RATE_LIMIT as retryable', () => {
    expect(classifyPipelineError(errWith('too many requests')).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------------

describe('ErrorCategory.AUTH', () => {
  it('classifies private video', () => {
    expect(classifyPipelineError(errWith('This is a private video')).category)
      .toBe(ErrorCategory.AUTH);
  });

  it('classifies age restricted', () => {
    expect(classifyPipelineError(errWith('Sign in to verify your age')).category)
      .toBe(ErrorCategory.AUTH);
  });

  it('classifies bot detection', () => {
    expect(classifyPipelineError(errWith('Sign in to confirm you are not a bot')).category)
      .toBe(ErrorCategory.AUTH);
  });

  it('marks AUTH as NOT retryable', () => {
    expect(classifyPipelineError(errWith('private video')).retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DOWNLOAD
// ---------------------------------------------------------------------------

describe('ErrorCategory.DOWNLOAD', () => {
  it('classifies yt-dlp download failure', () => {
    expect(classifyPipelineError(errWith('yt-dlp: failed to download video')).category)
      .toBe(ErrorCategory.DOWNLOAD);
  });

  it('classifies video unavailable', () => {
    expect(classifyPipelineError(errWith('Video unavailable')).category)
      .toBe(ErrorCategory.DOWNLOAD);
  });

  it('classifies geo-restricted', () => {
    expect(classifyPipelineError(errWith('This video is geo-restricted in your country')).category)
      .toBe(ErrorCategory.DOWNLOAD);
  });

  it('marks DOWNLOAD as retryable', () => {
    expect(classifyPipelineError(errWith('failed to download')).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FFMPEG
// ---------------------------------------------------------------------------

describe('ErrorCategory.FFMPEG', () => {
  it('classifies ffmpeg output-file-is-empty errors', () => {
    expect(classifyPipelineError(errWith('Output file is empty, nothing was encoded')).category)
      .toBe(ErrorCategory.FFMPEG);
  });

  it('classifies ffmpeg moov atom not found', () => {
    expect(classifyPipelineError(errWith('moov atom not found')).category)
      .toBe(ErrorCategory.FFMPEG);
  });

  it('classifies ffprobe binary errors', () => {
    expect(classifyPipelineError(errWith('ffprobe: No such file or directory')).category)
      .toBe(ErrorCategory.FFMPEG);
  });

  it('marks FFMPEG as NOT retryable', () => {
    expect(classifyPipelineError(errWith('ffmpeg: invalid data found')).retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TRANSCRIPTION
// ---------------------------------------------------------------------------

describe('ErrorCategory.TRANSCRIPTION', () => {
  it('classifies Whisper API errors', () => {
    expect(classifyPipelineError(errWith('Whisper API returned an error')).category)
      .toBe(ErrorCategory.TRANSCRIPTION);
  });

  it('classifies circuit breaker open state', () => {
    expect(classifyPipelineError(errWith('CIRCUIT_OPEN: transcription circuit breaker is open')).category)
      .toBe(ErrorCategory.TRANSCRIPTION);
  });

  it('classifies audio extraction failure', () => {
    expect(classifyPipelineError(errWith('Audio extraction failed for input file')).category)
      .toBe(ErrorCategory.TRANSCRIPTION);
  });

  it('marks TRANSCRIPTION as retryable', () => {
    expect(classifyPipelineError(errWith('WHISPER_UNAVAILABLE')).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LLM
// ---------------------------------------------------------------------------

describe('ErrorCategory.LLM', () => {
  it('classifies Gemini model failures', () => {
    expect(classifyPipelineError(errWith('Gemini model failed to generate content')).category)
      .toBe(ErrorCategory.LLM);
  });

  it('classifies AI returning 0 clips', () => {
    expect(classifyPipelineError(errWith('AI returned 0 clips. The transcription may have been too short.')).category)
      .toBe(ErrorCategory.LLM);
  });

  it('classifies Groq completion errors (non-audio)', () => {
    expect(classifyPipelineError(errWith('Groq returned an empty response')).category)
      .toBe(ErrorCategory.LLM);
  });

  it('marks LLM as retryable', () => {
    expect(classifyPipelineError(errWith('Gemini failed')).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BOUNDARY
// ---------------------------------------------------------------------------

describe('ErrorCategory.BOUNDARY', () => {
  it('classifies boundary planning errors', () => {
    expect(classifyPipelineError(errWith('Boundary planner returned no valid candidate ranges')).category)
      .toBe(ErrorCategory.BOUNDARY);
  });

  it('classifies story arc failures', () => {
    expect(classifyPipelineError(errWith('story arc computation failed')).category)
      .toBe(ErrorCategory.BOUNDARY);
  });

  it('marks BOUNDARY as NOT retryable', () => {
    expect(classifyPipelineError(errWith('boundary computation failed')).retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------

describe('ErrorCategory.RENDER', () => {
  it('classifies render worker failures', () => {
    expect(classifyPipelineError(errWith('renderWorker: clip processing failed')).category)
      .toBe(ErrorCategory.RENDER);
  });

  it('classifies thumbnail extraction failures', () => {
    expect(classifyPipelineError(errWith('Thumbnail extraction failed')).category)
      .toBe(ErrorCategory.RENDER);
  });

  it('marks RENDER as retryable', () => {
    expect(classifyPipelineError(errWith('render failed')).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UPLOAD
// ---------------------------------------------------------------------------

describe('ErrorCategory.UPLOAD', () => {
  it('classifies Backblaze B2 upload failures', () => {
    expect(classifyPipelineError(errWith('Backblaze B2 upload failed with status 500')).category)
      .toBe(ErrorCategory.UPLOAD);
  });

  it('classifies generic upload errors', () => {
    expect(classifyPipelineError(errWith('Storage upload failed for clip mp4')).category)
      .toBe(ErrorCategory.UPLOAD);
  });

  it('marks UPLOAD as retryable', () => {
    expect(classifyPipelineError(errWith('upload failed')).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DATABASE
// ---------------------------------------------------------------------------

describe('ErrorCategory.DATABASE', () => {
  it('classifies Supabase schema cache errors', () => {
    expect(classifyPipelineError(errWith('Could not find the table in the schema cache')).category)
      .toBe(ErrorCategory.DATABASE);
  });

  it('classifies PostgREST column errors', () => {
    expect(classifyPipelineError(errWith('column "stage_label" does not exist')).category)
      .toBe(ErrorCategory.DATABASE);
  });

  it('classifies database update failures', () => {
    // Note: 'DB update failed: connection timeout' correctly resolves to TIMEOUT.
    // Use a DB-specific message without ambiguous keywords here.
    expect(classifyPipelineError(errWith('DB insert failed: duplicate key violates unique constraint')).category)
      .toBe(ErrorCategory.DATABASE);
  });

  it('marks DATABASE as retryable', () => {
    expect(classifyPipelineError(errWith('database error')).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// QUEUE
// ---------------------------------------------------------------------------

describe('ErrorCategory.QUEUE', () => {
  it('classifies Redis connection failures', () => {
    expect(classifyPipelineError(errWith('Redis connection refused')).category)
      .toBe(ErrorCategory.QUEUE);
  });

  it('classifies job queue failures', () => {
    expect(classifyPipelineError(errWith('Failed to enqueue render job')).category)
      .toBe(ErrorCategory.QUEUE);
  });

  it('marks QUEUE as retryable', () => {
    expect(classifyPipelineError(errWith('queue error')).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WORKER
// ---------------------------------------------------------------------------

describe('ErrorCategory.WORKER', () => {
  it('classifies worker shutdown errors', () => {
    expect(classifyPipelineError(errWith('WORKER_SHUTDOWN detected during processing')).category)
      .toBe(ErrorCategory.WORKER);
  });

  it('classifies OOM kills', () => {
    expect(classifyPipelineError(errWith('Process killed: out of memory (OOM)')).category)
      .toBe(ErrorCategory.WORKER);
  });

  it('marks WORKER as retryable', () => {
    expect(classifyPipelineError(errWith('worker error')).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UNKNOWN
// ---------------------------------------------------------------------------

describe('ErrorCategory.UNKNOWN', () => {
  it('classifies truly unknown errors', () => {
    expect(classifyPipelineError(errWith('Some totally unrelated error about a missing plugin XYZ')).category)
      .toBe(ErrorCategory.UNKNOWN);
  });

  it('handles empty message', () => {
    const result = classifyPipelineError(errWith(''));
    expect(result.category).toBe(ErrorCategory.UNKNOWN);
  });

  it('handles null/undefined inputs safely', () => {
    expect(() => classifyPipelineError(null)).not.toThrow();
    expect(() => classifyPipelineError(undefined)).not.toThrow();
  });

  it('marks UNKNOWN as NOT retryable', () => {
    expect(classifyPipelineError(errWith('completely unknown failure xyz123')).retryable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Backwards-compatible classifyError() shim
// ---------------------------------------------------------------------------

describe('classifyError() shim (backwards compatibility)', () => {
  it('still returns category and summary', () => {
    const result = classifyError('HTTP error 429');
    expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
    expect(typeof result.summary).toBe('string');
  });

  it('returns UNKNOWN for empty stderr', () => {
    const result = classifyError(undefined);
    expect(result.category).toBe(ErrorCategory.UNKNOWN);
  });

  it('classifies yt-dlp errors correctly via shim', () => {
    const result = classifyError('ERROR: [youtube] Video unavailable');
    expect(result.category).toBe(ErrorCategory.DOWNLOAD);
  });
});

// ---------------------------------------------------------------------------
// Hint system
// ---------------------------------------------------------------------------

describe('hint parameter improves classification accuracy', () => {
  it('uses hint to disambiguate ambiguous messages', () => {
    // "process failed" alone is ambiguous — hint directs it
    const result = classifyPipelineError(errWith('process failed'), 'transcription');
    expect(result.category).toBe(ErrorCategory.TRANSCRIPTION);
  });
});

// ---------------------------------------------------------------------------
// Error object with attached stderr
// ---------------------------------------------------------------------------

describe('classifies errors with .stderr property', () => {
  it('uses .stderr field when message alone would be UNKNOWN', () => {
    const err = Object.assign(new Error('Child process exited with code 1'), {
      stderr: 'yt-dlp: ERROR: video unavailable',
    });
    expect(classifyPipelineError(err).category).toBe(ErrorCategory.DOWNLOAD);
  });
});
