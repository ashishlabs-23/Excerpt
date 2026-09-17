/**
 * PublicationPlan.ts — Canonical multi-platform publication specification for @excerpt/clipping-core.
 *
 * Models real API constraints across TikTok Direct Post API, YouTube Data API v3,
 * Instagram Graph API, and manual download workflows:
 *   - Creator OAuth authorization state
 *   - Platform capability restrictions (e.g. TikTok unaudited sandbox vs production)
 *   - Direct post vs pull-from-URL video transfer
 *   - Privacy/visibility level
 *   - Platform-ready copy & hashtag tokens
 */

export type TargetPlatform =
  | 'youtube_shorts'
  | 'tiktok'
  | 'instagram_reels'
  | 'download_only';

export type PlatformAuthorizationState =
  | 'authorized'
  | 'pending_auth'
  | 'unaudited_sandbox'
  | 'expired'
  | 'manual_only';

export type PublicationPrivacy =
  | 'public'
  | 'unlisted'
  | 'private'
  | 'mutual_follow_friends';

export type VideoTransferMethod =
  | 'direct_post_upload'
  | 'pull_from_url'
  | 'manual_download';

export type PublicationStatus =
  | 'draft'
  | 'ready'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed';

export interface PlatformCapabilities {
  maxDurationSec: number;
  minDurationSec: number;
  supportsDirectPost: boolean;
  supportsPullFromUrl: boolean;
  requiresCreatorReview: boolean;
  titleMaxLength: number;
  descriptionMaxLength: number;
}

export const PLATFORM_CAPABILITIES: Record<TargetPlatform, PlatformCapabilities> = {
  tiktok: {
    maxDurationSec: 600,
    minDurationSec: 3,
    supportsDirectPost: true,
    supportsPullFromUrl: true,
    requiresCreatorReview: true,
    titleMaxLength: 150,
    descriptionMaxLength: 2200,
  },
  youtube_shorts: {
    maxDurationSec: 60,
    minDurationSec: 5,
    supportsDirectPost: true,
    supportsPullFromUrl: false,
    requiresCreatorReview: false,
    titleMaxLength: 100,
    descriptionMaxLength: 5000,
  },
  instagram_reels: {
    maxDurationSec: 90,
    minDurationSec: 3,
    supportsDirectPost: true,
    supportsPullFromUrl: true,
    requiresCreatorReview: false,
    titleMaxLength: 100,
    descriptionMaxLength: 2200,
  },
  download_only: {
    maxDurationSec: 3600,
    minDurationSec: 1,
    supportsDirectPost: false,
    supportsPullFromUrl: false,
    requiresCreatorReview: false,
    titleMaxLength: 255,
    descriptionMaxLength: 10000,
  },
};

export interface PublicationPlan {
  id: string;
  projectId: string;
  clipId: string;
  targetPlatform: TargetPlatform;
  authorizationState: PlatformAuthorizationState;
  privacy: PublicationPrivacy;
  transferMethod: VideoTransferMethod;
  capabilities: PlatformCapabilities;

  copy: {
    title: string;
    description: string;
    hashtags: string[];
    coverTimestampSec?: number;
  };

  scheduledAt?: string;
  status: PublicationStatus;
  externalPublishId?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export function createPublicationPlan(params: {
  id: string;
  projectId: string;
  clipId: string;
  targetPlatform: TargetPlatform;
  title: string;
  description?: string;
  hashtags?: string[];
  privacy?: PublicationPrivacy;
  authorizationState?: PlatformAuthorizationState;
  scheduledAt?: string;
}): PublicationPlan {
  const now = new Date().toISOString();
  const caps = PLATFORM_CAPABILITIES[params.targetPlatform];

  return {
    id: params.id,
    projectId: params.projectId,
    clipId: params.clipId,
    targetPlatform: params.targetPlatform,
    authorizationState: params.authorizationState || 'manual_only',
    privacy: params.privacy || 'public',
    transferMethod: caps.supportsPullFromUrl ? 'pull_from_url' : (caps.supportsDirectPost ? 'direct_post_upload' : 'manual_download'),
    capabilities: caps,
    copy: {
      title: params.title.slice(0, caps.titleMaxLength),
      description: (params.description || '').slice(0, caps.descriptionMaxLength),
      hashtags: (params.hashtags || []).map(h => h.startsWith('#') ? h : `#${h}`),
    },
    scheduledAt: params.scheduledAt,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}
