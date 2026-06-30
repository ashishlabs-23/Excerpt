import { CropPlan, RenderPlan } from './SpatialIntelligenceTypes';

/**
 * Translates a high-level CropPlan (with layouts and focal regions) 
 * into absolute pixel/percentage coordinates (RenderPlan).
 * This keeps the rendering logic completely abstracted from the AI logic.
 */
export class RenderPlanTranslator {
    public translate(cropPlan: CropPlan): RenderPlan {
        // In a real implementation, this maps layout partitions (e.g. 'single' vs 'split')
        // to actual virtual camera coordinates, incorporating smoothers like Kalman/EMA.
        
        let targetX = 0.5;
        let targetY = 0.5;
        let targetScale = 1.0;

        if (cropPlan.focalRegions.length > 0) {
            targetX = cropPlan.focalRegions[0].bbox.x;
            targetY = cropPlan.focalRegions[0].bbox.y;
        }

        // Apply composition strategy offsets
        if (cropPlan.compositionStrategy === 'rule_of_thirds') {
            targetY = Math.max(0, targetY - 0.15); 
        }

        return {
            frameIndex: cropPlan.frameIndex,
            timestamp: cropPlan.timestamp,
            x: Math.max(0, targetX - 0.25), // Assuming 9:16 crop width is ~0.5 of 16:9
            y: Math.max(0, targetY - 0.5),  // Assuming full height
            w: 0.5625, // 9/16 width relative to height
            h: 1.0,
            scale: targetScale
        };
    }
}
