import { CropPlan, PersistentTrack, SpatialAdapter, SpatialFrame, CameraMotion } from './SpatialIntelligenceTypes';
import { CameraMotionEstimator } from './CameraMotionEstimator';
import { KalmanFilter2D } from './KalmanFilter';
import { EMAFilter2D } from './EMAFilter';
import { ConfidenceEngine } from './ConfidenceEngine';
import { DeadZoneController } from './DeadZoneController';

import { TemporalConsistencyEngine } from './TemporalConsistencyEngine';

export class UnifiedCropPlanner {
    private cameraMotionEstimator = new CameraMotionEstimator();
    private kalman = new KalmanFilter2D(0.5, 0.5);
    private ema = new EMAFilter2D(0.3);
    private confidenceEngine = new ConfidenceEngine();
    private deadZone = new DeadZoneController(0.1, 0.1);
    private temporalConsistency = new TemporalConsistencyEngine();

    private currentCameraCenter = { x: 0.5, y: 0.5 };

    public processFrame(frame: SpatialFrame, adapter: SpatialAdapter, dt: number): CropPlan {
        const activeTracks = frame.regions as unknown as PersistentTrack[];
        const prioritizedTracks = adapter.evaluateRegions(activeTracks);

        let sumX = 0, sumY = 0, sumWeight = 0;
        let highestConfidence = 0;

        for (const track of prioritizedTracks) {
            sumX += track.bbox.x * track.importance;
            sumY += track.bbox.y * track.importance;
            sumWeight += track.importance;
            if (track.confidence > highestConfidence) highestConfidence = track.confidence;
        }

        const rawTarget = sumWeight > 0 
            ? { x: sumX / sumWeight, y: sumY / sumWeight } 
            : { x: 0.5, y: 0.5 };

        const cameraMotion: CameraMotion = frame.globalMotion 
            ? this.cameraMotionEstimator.estimate({ 
                dx: frame.globalMotion.dx, dy: frame.globalMotion.dy, 
                zoomDelta: 0, rotationDelta: 0, confidence: 1.0 
              }, dt) 
            : { panX: 0, panY: 0, zoom: 0, rotation: 0, confidence: 0 };

        const velocity = { x: 0, y: 0 };
        const predictedTarget = this.kalman.predict(velocity, dt);
        const filteredTarget = this.kalman.update(rawTarget);
        const smoothedTarget = this.ema.smooth(filteredTarget.x, filteredTarget.y);

        this.currentCameraCenter = this.deadZone.apply(smoothedTarget, this.currentCameraCenter);

        const cropConfidence = {
            score: highestConfidence,
            stability: 1.0,
            reason: highestConfidence < 0.5 ? 'low_confidence_fallback' : 'tracking'
        };

        const proposedPlan: CropPlan = {
            frameIndex: frame.frameIndex,
            timestamp: frame.timestamp,
            layout: 'single',
            regions: prioritizedTracks,
            cameraMotion,
            reason: 'unified_center_tracking',
            confidence: cropConfidence,
            centerX: this.currentCameraCenter.x,
            centerY: this.currentCameraCenter.y,
            zoom: 1.0
        };

        // 7. Temporal Consistency Check
        return this.temporalConsistency.stabilize(proposedPlan);
    }
}
