import { InterestRegion, LayoutType } from './SpatialIntelligenceTypes';

export interface LayoutDecision {
    type: LayoutType;
    primaryRegion: InterestRegion;
    secondaryRegion?: InterestRegion;
}

/**
 * Determines the frame composition mapping (single, split, pip).
 * Maps winning InterestRegions to physical layout partitions.
 */
export class LayoutEngine {
    
    public determineLayout(resolvedRegions: InterestRegion[]): LayoutDecision {
        if (!resolvedRegions || resolvedRegions.length === 0) {
            // Fallback safe mode
            return {
                type: 'safe_mode',
                primaryRegion: {
                    id: 'fallback',
                    type: 'object',
                    bbox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
                    confidence: 1.0,
                    weight: 1.0
                }
            };
        }

        const primary = resolvedRegions[0];

        // If there is only one region or it overwhelmingly dominates priority
        if (resolvedRegions.length === 1 || (primary.weight * primary.confidence) > 0.85) {
            return {
                type: 'single',
                primaryRegion: primary
            };
        }

        const secondary = resolvedRegions[1];

        // If we have an OCR or slides region competing with a face, use PiP or Split
        if (secondary.type === 'ocr' || secondary.type === 'slides' || secondary.type === 'gameplay') {
            return {
                type: 'split', // Or 'pip', to be expanded
                primaryRegion: primary,
                secondaryRegion: secondary
            };
        }

        // Default to single
        return {
            type: 'single',
            primaryRegion: primary
        };
    }
}
