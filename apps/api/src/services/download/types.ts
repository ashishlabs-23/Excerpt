export type FailureCategory = 
  | 'HTTP_429'
  | 'BOT_DETECTION'
  | 'LOGIN_REQUIRED'
  | 'PRIVATE_VIDEO'
  | 'REGIONAL_BLOCK'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'MERGE_ERROR'
  | 'UNKNOWN';

export interface ProxyProvider {
  getProxyUrl(): string | undefined;
}

export interface DownloadStrategy {
  id: string; // e.g. "web-cookies"
  resolutionCap: string;
  extractorArgs?: string;
  useCookies: boolean;
  maxRetries: number;
  userAgent?: string;
  rateLimit?: string;
  proxyProvider?: ProxyProvider;
}

export interface DownloadAttempt {
  strategyId: string;
  client: string;
  command?: string[];
  ytDlpVersion?: string;
  ffmpegVersion?: string;
  pythonVersion?: string;
  environment?: any;
  result: string;
  exitCode?: number;
  httpStatus?: number;
  failureCategory?: FailureCategory;
  duration_ms: number;
  timings?: {
    metadataMs?: number;
    downloadMs?: number;
    mergeMs?: number;
  };
  downloadSpeedMbps?: number;
  stderr_tail?: string;
}
