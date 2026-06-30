import { LayoutDecision } from './LayoutEngine';
import { LayoutType } from './SpatialIntelligenceTypes';

export class TemporalConsistencyEngine {
    private layoutHistory: LayoutType[] = [];
    private readonly LAYOUT_STABILITY_FRAMES = 60; // Require 2 seconds at 30fps to change layout
    private currentStableLayout: LayoutType = 'single';

    /**
     * Evaluates the proposed layout over time to prevent rapid oscillation
     * and layout switching. Ensures visual continuity over a 2-5 second window.
     */
    public stabilize(proposedLayout: LayoutDecision): LayoutDecision {
        this.layoutHistory.push(proposedLayout.type);
        if (this.layoutHistory.length > this.LAYOUT_STABILITY_FRAMES) {
            this.layoutHistory.shift();
        }

        // If all recent frames agree on a new layout, we can switch
        const allAgree = this.layoutHistory.every(l => l === proposedLayout.type);
        if (allAgree && this.layoutHistory.length === this.LAYOUT_STABILITY_FRAMES) {
            this.currentStableLayout = proposedLayout.type;
        }

        // Return a stabilized decision
        return {
            ...proposedLayout,
            type: this.currentStableLayout
        };
    }
}
