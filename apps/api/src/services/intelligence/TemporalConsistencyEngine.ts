import { CropPlan } from './SpatialIntelligenceTypes';

export class TemporalConsistencyEngine {
    private layoutHistory: string[] = [];
    private readonly LAYOUT_STABILITY_FRAMES = 60; // Require 2 seconds at 30fps to change layout
    private currentStableLayout: string = 'single';

    /**
     * Evaluates the proposed crop plan over time to prevent rapid oscillation
     * and layout switching. Ensures visual continuity over a 2-5 second window.
     */
    public stabilize(proposedPlan: CropPlan): CropPlan {
        // 1. Layout Stability
        this.layoutHistory.push(proposedPlan.layout);
        if (this.layoutHistory.length > this.LAYOUT_STABILITY_FRAMES) {
            this.layoutHistory.shift();
        }

        // If all recent frames agree on a new layout, we can switch
        const allAgree = this.layoutHistory.every(l => l === proposedPlan.layout);
        if (allAgree && this.layoutHistory.length === this.LAYOUT_STABILITY_FRAMES) {
            this.currentStableLayout = proposedPlan.layout;
        }

        // 2. Anti-oscillation for Crop Center
        // (In a real implementation, this would buffer the next N frames to peek ahead, 
        // or aggressively penalize sudden directional reversals).
        
        return {
            ...proposedPlan,
            layout: this.currentStableLayout as any
        };
    }
}
