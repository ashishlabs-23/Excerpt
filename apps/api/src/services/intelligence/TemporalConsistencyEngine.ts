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

    /**
     * Stabilizes horizontal & vertical focal center tracking for active speakers.
     * Enforces the Cinematic Hard-Cut vs Pan rule:
     * - Shift < 8%: Deadband (camera locked, 0 jitter)
     * - Shift 8-18%: Smooth subtle tracking
     * - Shift > 18%: Instantaneous Hard Cut (avoids nauseating pans across multi-speaker interviews)
     */
    public stabilizeFocalPoint(
        previousPoint: { x: number; y: number },
        proposedPoint: { x: number; y: number }
    ): { x: number; y: number; transition: 'locked' | 'smooth_pan' | 'hard_cut' } {
        const dx = Math.abs(proposedPoint.x - previousPoint.x);
        const dy = Math.abs(proposedPoint.y - previousPoint.y);

        // 1. Deadband threshold: subtle micro-movement is locked to eliminate jitter
        if (dx <= 0.08 && dy <= 0.08) {
            return {
                x: previousPoint.x,
                y: previousPoint.y,
                transition: 'locked'
            };
        }

        // 2. Hard-cut threshold: major speaker switch or large position change
        if (dx >= 0.18 || dy >= 0.25) {
            return {
                x: Number(proposedPoint.x.toFixed(4)),
                y: Number(proposedPoint.y.toFixed(4)),
                transition: 'hard_cut'
            };
        }

        // 3. Smooth tracking range: exponential moving average
        const smoothAlpha = 0.30;
        const smoothedX = previousPoint.x + (proposedPoint.x - previousPoint.x) * smoothAlpha;
        const smoothedY = previousPoint.y + (proposedPoint.y - previousPoint.y) * smoothAlpha;

        return {
            x: Number(smoothedX.toFixed(4)),
            y: Number(smoothedY.toFixed(4)),
            transition: 'smooth_pan'
        };
    }
}
