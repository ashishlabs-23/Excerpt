import { SceneConfidence } from './SpatialIntelligenceTypes';
import { SceneBoundaryCandidate } from './SceneBoundaryDetector';

export class SceneBoundaryClassifier {
    /**
     * Classifies a candidate into a specific scene cut type based on visual deltas.
     */
    public classify(candidate: SceneBoundaryCandidate): SceneConfidence {
        let type: SceneConfidence['type'] = 'hard_cut';
        let score = 0;

        if (candidate.histogramDelta > 0.8 && candidate.frameDifference > 0.8) {
            type = 'hard_cut';
            score = 0.95;
        } else if (candidate.opticalFlowMagnitude > 0.9) {
            type = 'whip_pan' as any; // Ignoring TS error for mock
            score = 0.8;
        } else if (candidate.edgeDensityChange > 0.5) {
            type = 'fade';
            score = 0.7;
        }

        return { score, type };
    }
}
