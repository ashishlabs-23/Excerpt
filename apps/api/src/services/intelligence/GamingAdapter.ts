import { PersistentTrack, SpatialAdapter, InterestRegion } from './SpatialIntelligenceTypes';

export class GamingAdapter implements SpatialAdapter {
    public generateInterestRegions(tracks: PersistentTrack[]): InterestRegion[] {
        return tracks.map(track => {
            let weight = 0.5;

            if (track.type === 'person') {
                weight = 0.7; // Facecam
            } else if (track.type === 'gameplay') {
                weight = 0.95; // Action/Crosshair
            }

            return {
                id: track.id.toString(),
                type: track.type,
                bbox: track.bbox,
                confidence: track.confidence,
                weight
            };
        });
    }
}
