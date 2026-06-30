import { LayoutDecision } from './LayoutEngine';
import { BoundingBox } from './SpatialIntelligenceTypes';

export interface ShotComposition {
    primaryCrop: BoundingBox;
    secondaryCrop?: BoundingBox;
    compositionStrategy: 'rule_of_thirds' | 'center' | 'lead_room' | 'conversation_balance' | 'safe_mode';
}

/**
 * Applies cinematography rules to layout partitions.
 * Moves beyond naive centering to implement Headroom, Lead Room, and Rule of Thirds.
 */
export class ShotCompositionEngine {
    
    public compose(layout: LayoutDecision): ShotComposition {
        if (layout.type === 'safe_mode') {
            return {
                primaryCrop: layout.primaryRegion.bbox,
                compositionStrategy: 'safe_mode'
            };
        }

        const primaryBbox = layout.primaryRegion.bbox;
        let composedPrimary: BoundingBox = { ...primaryBbox };
        let strategy: ShotComposition['compositionStrategy'] = 'center';

        // Cinematography Rule: Headroom
        // Faces should be in the upper third, not dead center vertically.
        if (layout.primaryRegion.type === 'person' || layout.primaryRegion.type === 'speaker') {
            strategy = 'rule_of_thirds';
            // Adjust the virtual center so the crop favors the top
            // A naive crop centers Y. By pushing our composed Y down, the final crop will frame higher.
            composedPrimary.y = Math.min(1.0, primaryBbox.y + 0.15); 
        }

        // Cinematography Rule: Lead Room
        // If an object is moving fast to the right, we should give space on the right.
        // In a full implementation, we use the velocity vector from the track.
        // Here we stub the concept.

        const composition: ShotComposition = {
            primaryCrop: composedPrimary,
            compositionStrategy: strategy
        };

        if (layout.secondaryRegion) {
            composition.secondaryCrop = { ...layout.secondaryRegion.bbox };
            // In split layouts, we apply conversation balance
            composition.compositionStrategy = 'conversation_balance';
        }

        return composition;
    }
}
