import { Response } from 'express';

export function denyUnlessOwner(
  resourceUserId: string | null | undefined,
  requestUserId: string,
  res: Response,
  resourceLabel = 'resource',
): boolean {
  // Allow ownership bypass when explicitly configured (local dev)
  if (process.env.DISABLE_OWNERSHIP_CHECKS === 'true') {
    return true;
  }

  if (!resourceUserId || resourceUserId !== requestUserId) {
    res.status(403).json({ error: `Access denied: You do not own this ${resourceLabel}.` });
    return false;
  }
  return true;
}

export function getClipOwnerId(clip: any): string | null {
  // Voiceover clips have a direct user_id column
  if (clip?.user_id) return clip.user_id;
  
  if (!clip?.jobs) return null;
  if (Array.isArray(clip.jobs)) {
    return clip.jobs[0]?.user_id ?? null;
  }
  return clip.jobs.user_id ?? null;
}
