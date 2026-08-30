import { Logger } from '@excerpt/shared';
import { VideoJobStatus, FinalDeliveryReport } from '@excerpt/clipping-core';
import { UploadedArtifact, PlaybackValidator } from './PlaybackValidator';
import { UploadIntegrity } from './UploadIntegrity';

export class DeliveryValidator {
  constructor(
    private logger: Logger,
    private playbackValidator: PlaybackValidator,
    private uploadIntegrity: UploadIntegrity
  ) {}

  /**
   * Derives the final parent job status based on the Partial Delivery Policy.
   */
  async finalizeJob(
    totalPlannedClips: number,
    artifacts: UploadedArtifact[]
  ): Promise<{ status: VideoJobStatus; validArtifacts: UploadedArtifact[]; report: FinalDeliveryReport }> {
    
    let verifiedCount = 0;
    const validArtifacts: UploadedArtifact[] = [];

    // Run validations
    for (const artifact of artifacts) {
      try {
        // 1. Upload Integrity
        if (artifact.remoteETag) {
          await this.uploadIntegrity.verifyChecksum(artifact.localPath, artifact.remoteETag);
        }
        
        // 2. Playback Validation
        await this.playbackValidator.validate(artifact);

        verifiedCount++;
        validArtifacts.push(artifact);
      } catch (e: any) {
        this.logger.warn(`Artifact ${artifact.id} failed delivery/playback validation and is discarded.`);
      }
    }

    const M = verifiedCount;
    const N = totalPlannedClips;

    let finalStatus: VideoJobStatus = 'failed';

    if (M === 0) {
      // Invariant 8 / Partial Delivery Policy
      finalStatus = 'failed:artifact_unusable';
    } else if (M > 0 && M < N) {
      // Partial Delivery Policy
      finalStatus = 'completed:partial';
    } else if (M === N) {
      finalStatus = 'completed';
    }

    this.logger.info(`Finalizing Job. Planned: ${N}, Valid: ${M}. Status: ${finalStatus}`);

    const report: FinalDeliveryReport = {
      requested: N,
      accepted: N,
      scheduled: N,
      rendered: artifacts.length,
      uploaded: artifacts.length,
      verified: M,
      playable: M
    };

    return {
      status: finalStatus,
      validArtifacts,
      report
    };
  }
}
