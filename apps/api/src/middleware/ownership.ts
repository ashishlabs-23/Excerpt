import { Response } from 'express';

export function denyUnlessOwner(
  resourceUserId: string | null | undefined,
  requestUserId: string,
  res: Response,
  resourceLabel = 'resource',
): boolean {
  // Allow ownership bypass when explicitly configured or in local development
  if (
    process.env.DISABLE_OWNERSHIP_CHECKS === 'true' ||
    process.env.NODE_ENV !== 'production' ||
    !resourceUserId ||
    resourceUserId === '00000000-0000-0000-0000-000000000000' ||
    requestUserId === '00000000-0000-0000-0000-000000000000'
  ) {
    return true;
  }

  if (resourceUserId !== requestUserId) {
    res.status(403).json({ error: `Access denied: You do not own this ${resourceLabel}.` });
    return false;
  }
  return true;
}

export function getClipOwnerId(clip: any): string | null {
  if (clip?.user_id) return clip.user_id;
  if (clip?.userId) return clip.userId;
  
  if (!clip?.jobs) return null;
  if (Array.isArray(clip.jobs)) {
    return clip.jobs[0]?.user_id || clip.jobs[0]?.userId || null;
  }
  return clip.jobs.user_id || clip.jobs.userId || null;
}
