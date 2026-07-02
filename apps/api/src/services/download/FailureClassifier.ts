import { FailureCategory } from './types';

export class FailureClassifier {
  public static classify(errorMsg: string, httpStatus?: number): FailureCategory {
    if (httpStatus === 429) return 'HTTP_429';
    if (httpStatus === 403) return 'BOT_DETECTION';
    if (httpStatus === 410) return 'PRIVATE_VIDEO'; // usually 410 Gone means not available
    
    const msg = errorMsg.toLowerCase();
    if (msg.includes('sign in to confirm you')) return 'BOT_DETECTION';
    if (msg.includes('login required')) return 'LOGIN_REQUIRED';
    if (msg.includes('private video')) return 'PRIVATE_VIDEO';
    if (msg.includes('video unavailable in your country')) return 'REGIONAL_BLOCK';
    if (msg.includes('timeout') || msg.includes('network is unreachable')) return 'NETWORK';
    if (msg.includes('killed_throttled') || msg.includes('download was too slow')) return 'TIMEOUT';
    if (msg.includes('merge failed')) return 'MERGE_ERROR';

    return 'UNKNOWN';
  }

  public static extractHttpStatus(errorMsg: string): number | undefined {
    const match = errorMsg.match(/HTTP Error (\d+)/i);
    return match ? parseInt(match[1], 10) : undefined;
  }
}
