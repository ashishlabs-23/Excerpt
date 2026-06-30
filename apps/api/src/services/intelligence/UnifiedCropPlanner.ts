import { CropPlan, PersistentTrack, SpatialAdapter, CameraMotion, InterestRegion, CropConfidence } from './SpatialIntelligenceTypes';
import { CameraMotionEstimator } from './CameraMotionEstimator';
import { PriorityResolver } from './PriorityResolver';
import { SaliencyEngine } from './SaliencyEngine';
import { TemporalConsistencyEngine } from './TemporalConsistencyEngine';
import { LayoutEngine } from './LayoutEngine';
import { ShotCompositionEngine } from './ShotCompositionEngine';

// We define a mock SpatialFrame here to simplify integration
export interface SpatialFrame {
    frameIndex: number;
    timestamp: number;
    regions: PersistentTrack[];
    globalMotion?: { dx: number; dy: number };
    ocrData?: any[];
    heatmapData?: any[];
}

export class UnifiedCropPlanner {
    private cameraMotionEstimator = new CameraMotionEstimator();
    private saliencyEngine = new SaliencyEngine();
    private priorityResolver = new PriorityResolver();
    private temporalConsistency = new TemporalConsistencyEngine();
    private layoutEngine = new LayoutEngine();
    private shotCompositionEngine = new ShotCompositionEngine();

    public processFrame(frame: SpatialFrame, adapter: SpatialAdapter, dt: number): CropPlan {
        // 1. Adapter & Saliency Fusion
        const domainRegions = adapter.generateInterestRegions(frame.regions);
        const saliencyRegions = this.saliencyEngine.fuseSaliency(frame.regions, frame.ocrData || [], frame.heatmapData || []);
        
        const allRegions = [...domainRegions, ...saliencyRegions];

        // 2. Priority Resolution
        const prioritizedRegions = this.priorityResolver.resolve(allRegions);

        // 3. Layout Engine
        const rawLayoutDecision = this.layoutEngine.determineLayout(prioritizedRegions);

        // 4. Temporal Consistency (pre-composition)
        const stableLayoutDecision = this.temporalConsistency.stabilize(rawLayoutDecision);

        // 5. Shot Composition (Cinematography)
        const shotComposition = this.shotCompositionEngine.compose(stableLayoutDecision);

        // 6. Camera Motion
        const cameraMotion: CameraMotion = frame.globalMotion 
            ? this.cameraMotionEstimator.estimate({ 
                dx: frame.globalMotion.dx, dy: frame.globalMotion.dy, 
                zoomDelta: 0, rotationDelta: 0, confidence: 1.0 
              }, dt) 
            : { panX: 0, panY: 0, zoom: 0, rotation: 0, confidence: 0 };

        const cropConfidence: CropConfidence = {
            score: stableLayoutDecision.primaryRegion?.confidence || 0,
            stability: 1.0,
            reason: 'composed_shot'
        };

        // 7. Output Crop Plan
        return {
            frameIndex: frame.frameIndex,
            timestamp: frame.timestamp,
            layout: stableLayoutDecision.type,
            focalRegions: [stableLayoutDecision.primaryRegion, stableLayoutDecision.secondaryRegion].filter(Boolean) as InterestRegion[],
            cameraMotion,
            confidence: cropConfidence,
            compositionStrategy: shotComposition.compositionStrategy
        };
    }
}
