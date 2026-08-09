import { RenderPlan } from '../contracts/RenderPlan';
import { PlaybackHealthReport } from './PlaybackValidator';

export interface ArtifactCheck {
  clipId: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  isPlayable?: boolean;
  storageVerified?: boolean;
  playbackHealth?: PlaybackHealthReport;
}

export interface DeliveryValidationReport {
  jobId: string;
  requested: number;
  accepted: number;
  scheduled: number;
  rendered: number;
  uploaded: number;
  verified: number;
  playable: number;
  pass: boolean;
  reason?: string;
  playbackHealthReports?: PlaybackHealthReport[];
  timestamp: string;
}

export class DeliveryValidator {
  /**
   * Validates full pipeline delivery funnel metrics against the RenderPlan contract.
   */
  public static validate(
    plan: RenderPlan,
    artifacts: ArtifactCheck[]
  ): DeliveryValidationReport {
    const scheduled = plan.renderJobs.length;
    const rendered = artifacts.length;
    
    const uploaded = artifacts.filter(
      (a) => Boolean(a.videoUrl && a.videoUrl.trim().length > 0)
    ).length;

    const verified = artifacts.filter(
      (a) => a.storageVerified !== false && Boolean(a.videoUrl)
    ).length;

    const playable = artifacts.filter(
      (a) => a.isPlayable !== false && Boolean(a.videoUrl)
    ).length;

    const minRequired = plan.deliveryPolicy.minSuccessfulClips;
    const pass = playable >= minRequired;

    let reason: string | undefined;
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
