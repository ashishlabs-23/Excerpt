"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeliveryValidator = void 0;
class DeliveryValidator {
    /**
     * Validates full pipeline delivery funnel metrics against the RenderPlan contract.
     */
    static validate(plan, artifacts) {
        const scheduled = plan.renderJobs.length;
        const rendered = artifacts.length;
        const uploaded = artifacts.filter((a) => Boolean(a.videoUrl && a.videoUrl.trim().length > 0)).length;
        const verified = artifacts.filter((a) => a.storageVerified !== false && Boolean(a.videoUrl)).length;
        const playable = artifacts.filter((a) => a.isPlayable !== false && Boolean(a.videoUrl)).length;
        const minRequired = plan.deliveryPolicy.minSuccessfulClips;
        const pass = playable >= minRequired;
        let reason;
        if (!pass) {
            reason = `Delivery validation failed: playable clips (${playable}) is below minimum required (${minRequired}) out of ${scheduled} scheduled.`;
        }
        return {
            jobId: plan.jobId,
            requested: plan.requestedClips,
            accepted: plan.acceptedCandidates,
            scheduled,
            rendered,
            uploaded,
            verified,
            playable,
            pass,
            reason,
            timestamp: new Date().toISOString(),
        };
    }
}
exports.DeliveryValidator = DeliveryValidator;
