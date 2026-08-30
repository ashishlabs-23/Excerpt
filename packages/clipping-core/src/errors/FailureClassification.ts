export type FailureCategory = 
  | 'DOWNLOAD' 
  | 'AUTH' 
  | 'RATE_LIMIT' 
  | 'INGESTION' 
  | 'TRANSCRIPTION' 
  | 'LLM' 
  | 'PERCEPTION' 
  | 'BOUNDARY' 
  | 'RANKING' 
  | 'RENDER' 
  | 'UPLOAD' 
  | 'DATABASE' 
  | 'QUEUE' 
  | 'WORKER' 
  | 'TIMEOUT' 
  | 'PLAYBACK' 
  | 'UNKNOWN';

export interface FailureProfile {
  isRetryable: boolean;
  isRecoverable: boolean;
}

export const FAILURE_CLASSIFICATIONS: Record<FailureCategory, FailureProfile> = {
  DOWNLOAD: { isRetryable: true, isRecoverable: true },
  AUTH: { isRetryable: false, isRecoverable: false }, // Fatal
  RATE_LIMIT: { isRetryable: true, isRecoverable: true },
  INGESTION: { isRetryable: false, isRecoverable: false }, // Corrupt source media is fatal
  TRANSCRIPTION: { isRetryable: true, isRecoverable: true }, // Usually transient API errors
  LLM: { isRetryable: true, isRecoverable: true },
  PERCEPTION: { isRetryable: true, isRecoverable: true },
  BOUNDARY: { isRetryable: false, isRecoverable: true },
  RANKING: { isRetryable: false, isRecoverable: true },
  RENDER: { isRetryable: true, isRecoverable: true }, // Might be transient node issues
  UPLOAD: { isRetryable: true, isRecoverable: true }, // Network drops
  DATABASE: { isRetryable: true, isRecoverable: true }, // Deadlocks, transient connection drops
  QUEUE: { isRetryable: true, isRecoverable: true },
  WORKER: { isRetryable: true, isRecoverable: false }, // Hardware failure, typically fatal for the current run
  TIMEOUT: { isRetryable: true, isRecoverable: true },
  PLAYBACK: { isRetryable: false, isRecoverable: false }, // Artifact is definitively corrupt
  UNKNOWN: { isRetryable: false, isRecoverable: false }
};
