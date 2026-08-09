"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PIPELINE_CONFIG = void 0;
exports.createRenderPlan = createRenderPlan;
exports.DEFAULT_PIPELINE_CONFIG = {
    defaultClipCount: 3,
    minClipDurationSec: 15,
    maxClipDurationSec: 45,
};
function createRenderPlan(params) {
    const { jobId, requestedClips, acceptedClips, aspectRatio = '9:16', quality = 'high', deliveryPolicy = {}, } = params;
    const renderJobs = acceptedClips.map((clip, index) => ({
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
        requestedClips: Math.max(1, requestedClips || exports.DEFAULT_PIPELINE_CONFIG.defaultClipCount),
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
