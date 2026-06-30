import { PersistentTrack, SpatialAdapter } from './SpatialIntelligenceTypes';

export class FootballAdapter implements SpatialAdapter {
    public evaluateRegions(tracks: PersistentTrack[]): PersistentTrack[] {
        return tracks.map(track => {
            let importance = 0.5;

            // Prioritize the ball
            if (track.type === 'ball') {
                importance = 1.0;
            } 
            // Secondary priority to players
            else if (track.type === 'person') {
                importance = 0.6;
            }
            // Ignore crowds or scoreboards for center crop, just keep them in frame if possible
            else if (track.type === 'scoreboard') {
                importance = 0.1;
            }

            return {
                ...track,
                importance
            };
        });
    }
}
