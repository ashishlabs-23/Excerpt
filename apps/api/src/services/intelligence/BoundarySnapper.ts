import { SceneConfidence } from './SpatialIntelligenceTypes';

export interface VisualBoundary {
    timestamp: number;
    confidence: SceneConfidence;
}

export class BoundarySnapper {
    private readonly MAX_SNAP_DISTANCE_SECONDS = 1.0;

    /**
     * Snaps a proposed narrative boundary to the nearest logical visual boundary.
     */
    public snap(narrativeTimestamp: number, visualBoundaries: VisualBoundary[]): number {
        let bestSnap = narrativeTimestamp;
        let smallestDelta = this.MAX_SNAP_DISTANCE_SECONDS;

        for (const boundary of visualBoundaries) {
            const delta = Math.abs(boundary.timestamp - narrativeTimestamp);
            if (delta <= smallestDelta && boundary.confidence.score > 0.8) {
                smallestDelta = delta;
                bestSnap = boundary.timestamp;
            }
        }

        return bestSnap;
    }
}
