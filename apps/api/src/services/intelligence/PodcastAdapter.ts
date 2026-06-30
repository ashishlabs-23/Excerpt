import { PersistentTrack, SpatialAdapter, InterestRegion } from './SpatialIntelligenceTypes';

export class PodcastAdapter implements SpatialAdapter {
    public generateInterestRegions(tracks: PersistentTrack[]): InterestRegion[] {
        return tracks.map(track => {
            let weight = 0.5;

            // In a real podcast, active speaker detection would feed into the track metadata
            if (track.type === 'person') {
                // If we know this person is actively speaking, weight them high. 
                // Defaulting to 0.9 for faces.
                weight = 0.9; 
            } else if (track.type === 'object') { // e.g. microphone or shared screen
                weight = 0.3;
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
