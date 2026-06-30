import { PersistentTrack, TrackingConfidence } from './SpatialIntelligenceTypes';

export class ConfidenceEngine {
    private readonly FREEZE_THRESHOLD = 0.65;
    private readonly RECOVERY_THRESHOLD = 0.85;

    public evaluateTrackingConfidence(track: PersistentTrack): TrackingConfidence {
        let reason = 'stable';
        let score = track.confidence;
        
        // Penalize confidence if track is occluded/lost
        if (track.occluded) {
            score -= (track.lostFrames * 0.05);
            reason = 'occluded';
        }
        
        // Apply floor
        score = Math.max(0, score);
        
        if (score < this.FREEZE_THRESHOLD) {
            reason = 'freeze_crop';
        } else if (score >= this.FREEZE_THRESHOLD && score < this.RECOVERY_THRESHOLD) {
            reason = 'recovering';
        }

        return {
            id: track.id,
            score,
            reason
        };
    }
}
