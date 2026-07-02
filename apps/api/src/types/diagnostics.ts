export interface TimelineEvent {
  stage: string;
  time: string;
}

export interface RetryAttempt {
  attempt: number;
  provider: string;
  result: string;
}

export interface DownloadDetails {
  extractor?: string;
  resolution?: string;
  duration?: number;
  cookies_used?: boolean;
  proxy_used?: boolean;
}

export interface JobDebugData {
  stage?: string;
  operation?: string;
  exit_code?: number;
  error_type?: string;
  summary?: string;
  stderr_tail?: string;
  timestamp?: string;
  timeline?: TimelineEvent[];
  retries?: RetryAttempt[];
  download_details?: DownloadDetails;
  [key: string]: any; // Allow legacy properties
}

export interface JobPerformanceMetrics {
  download_ms?: number;
  transcribe_ms?: number;
  render_ms?: number;
  memory_mb?: number;
  worker_id?: string;
  [key: string]: any; // Allow legacy properties
}
