import { InterestRegion } from './SpatialIntelligenceTypes';

/**
 * Resolves conflicts between multiple InterestRegions.
 * Determines the absolute focal priorities for the layout engine.
 */
export class PriorityResolver {
    public resolve(regions: InterestRegion[]): InterestRegion[] {
        if (!regions || regions.length === 0) return [];

        // Sort descending by weight * confidence
        const sorted = [...regions].sort((a, b) => {
            const scoreA = a.weight * a.confidence;
            const scoreB = b.weight * b.confidence;
            return scoreB - scoreA;
        });

        // The top region is the primary focus. 
        // We return the sorted list so the LayoutEngine can decide how many to include.
        return sorted;
    }
}
