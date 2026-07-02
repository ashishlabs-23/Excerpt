export enum ErrorCategory {
  RATE_LIMIT = 'Rate Limit',
  BOT_DETECTION = 'Bot Detection',
  UNAVAILABLE = 'Unavailable',
  PERMISSIONS = 'Permissions',
  AGE_GATE = 'Age Gate',
  GEO_RESTRICTED = 'Geo-Restricted',
  NETWORK_ERROR = 'Network Error',
  UNKNOWN = 'Unknown Error',
}

export function classifyError(stderr: string | undefined): { category: ErrorCategory; summary: string } {
  if (!stderr) return { category: ErrorCategory.UNKNOWN, summary: 'No error output' };
  
  const lowerErr = stderr.toLowerCase();

  if (lowerErr.includes('http error 429') || lowerErr.includes('too many requests')) {
    return { category: ErrorCategory.RATE_LIMIT, summary: 'HTTP 429: Rate Limit Exceeded' };
  }
  
  if (lowerErr.includes('sign in to confirm you') || lowerErr.includes('bot')) {
    return { category: ErrorCategory.BOT_DETECTION, summary: 'Blocked by Bot Detection' };
  }

  if (lowerErr.includes('video unavailable') || lowerErr.includes('this video isn\'t available')) {
    return { category: ErrorCategory.UNAVAILABLE, summary: 'Video is unavailable or deleted' };
  }

  if (lowerErr.includes('private video') || lowerErr.includes('members only')) {
    return { category: ErrorCategory.PERMISSIONS, summary: 'Video is private or members-only' };
  }

  if (lowerErr.includes('age restricted') || lowerErr.includes('sign in to verify your age')) {
    return { category: ErrorCategory.AGE_GATE, summary: 'Video is age-restricted' };
  }
  
  if (lowerErr.includes('country') || lowerErr.includes('geo')) {
    return { category: ErrorCategory.GEO_RESTRICTED, summary: 'Video is geo-restricted' };
  }

  if (lowerErr.includes('econnreset') || lowerErr.includes('etimedout') || lowerErr.includes('network is unreachable')) {
    return { category: ErrorCategory.NETWORK_ERROR, summary: 'Network connection failed' };
  }

  return { category: ErrorCategory.UNKNOWN, summary: 'Unexpected Error' };
}
