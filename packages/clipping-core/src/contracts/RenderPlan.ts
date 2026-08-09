export type AspectRatio = '9:16' | '1:1' | '16:9';
export type RenderFormat = 'mp4';
export type RenderQuality = 'high' | 'draft';

export interface RenderJobPlan {
  id: string;
  clipId: string;
  aspectRatio: AspectRatio;
  format: RenderFormat;
  quality: RenderQuality;
  expectedOutputs: {
    video: boolean;
    thumbnail: boolean;
    subtitle: boolean;
  };
}

export interface DeliveryPolicy {
  allowPartialDelivery: boolean;
  minSuccessfulClips: number;
}

export interface RenderPlan {
  jobId: string;
  requestedClips: number;
  acceptedCandidates: number;
  renderJobs: RenderJobPlan[];
  expectedArtifacts: number;
  deliveryPolicy: DeliveryPolicy;
  createdAt: string;
}

export interface PipelineConfig {
  defaultClipCount: number;
  minClipDurationSec: number;
  maxClipDurationSec: number;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  defaultClipCount: 3,
  minClipDurationSec: 15,
  maxClipDurationSec: 45,
};

export function createRenderPlan(params: {
  jobId: string;
  requestedClips: number;
  acceptedClips: Array<{ id: string }>;
  aspectRatio?: AspectRatio;
  quality?: RenderQuality;
  deliveryPolicy?: Partial<DeliveryPolicy>;
}): RenderPlan {
  const {
    jobId,
    requestedClips,
    acceptedClips,
    aspectRatio = '9:16',
    quality = 'high',
    deliveryPolicy = {},
  } = params;

  const renderJobs: RenderJobPlan[] = acceptedClips.map((clip, index) => ({
    id: `render_job_${jobId}_${clip.id}_${index + 1}`,
    clipId: clip.id,
    aspectRatio,
    format: 'mp4',
    quality,
    expectedOutputs: {
      video: true,
      thumbnail: true,
      subtitle: true,
    },
  }));

  const expectedArtifactsPerJob = 2; // video + thumbnail
  const expectedArtifacts = renderJobs.length * expectedArtifactsPerJob;

  return {
    jobId,
    requestedClips: Math.max(1, requestedClips || DEFAULT_PIPELINE_CONFIG.defaultClipCount),
    acceptedCandidates: acceptedClips.length,
    renderJobs,
    expectedArtifacts,
    deliveryPolicy: {
      allowPartialDelivery: deliveryPolicy.allowPartialDelivery ?? true,
      minSuccessfulClips: deliveryPolicy.minSuccessfulClips ?? Math.min(1, acceptedClips.length),
    },
    createdAt: new Date().toISOString(),
  };
}
