import { CameraMotion, Vector2 } from './SpatialIntelligenceTypes';

/**
 * Interface representing raw global motion vectors typically provided 
 * by an optical flow or feature-matching lower-level adapter (e.g. OpenCV).
 */
export interface RawMotionData {
    dx: number;
    dy: number;
    zoomDelta: number;
    rotationDelta: number;
    confidence: number;
}

export class CameraMotionEstimator {
    private currentPanX = 0;
    private currentPanY = 0;
    private currentZoom = 1.0;
    private currentRotation = 0;

    /**
     * Estimates global camera motion from raw background motion vectors.
     * Subtracts global motion from object motion to derive true object velocity.
     */
    public estimate(rawMotion: RawMotionData, deltaTime: number): CameraMotion {
        // Integrate deltas to maintain global state (simplified model)
        // In a real implementation, we would apply a low-pass filter here to ignore noise.
        
        const panVelocityX = rawMotion.dx / deltaTime;
        const panVelocityY = rawMotion.dy / deltaTime;
        
        // Update global state
        this.currentPanX += rawMotion.dx;
        this.currentPanY += rawMotion.dy;
        this.currentZoom *= (1 + rawMotion.zoomDelta);
        this.currentRotation += rawMotion.rotationDelta;

        return {
            panX: panVelocityX,
            panY: panVelocityY,
            zoom: rawMotion.zoomDelta / deltaTime, // Zoom velocity
            rotation: rawMotion.rotationDelta / deltaTime, // Rotation velocity
            confidence: rawMotion.confidence
        };
    }

    /**
     * Removes the camera's global motion from an object's raw velocity 
     * to find the object's true independent velocity within the scene.
     */
    public subtractCameraMotion(objectVelocity: Vector2, cameraMotion: CameraMotion): Vector2 {
        return {
            x: objectVelocity.x - cameraMotion.panX,
            y: objectVelocity.y - cameraMotion.panY
        };
    }
    
    public reset() {
        this.currentPanX = 0;
        this.currentPanY = 0;
        this.currentZoom = 1.0;
        this.currentRotation = 0;
    }
}
