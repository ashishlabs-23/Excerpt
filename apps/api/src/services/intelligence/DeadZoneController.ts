import { Vector2 } from './SpatialIntelligenceTypes';

export class DeadZoneController {
    // Defines a normalized dead-zone (e.g. 0.2 means the center 20% of the screen)
    private deadZoneRadiusX: number;
    private deadZoneRadiusY: number;

    constructor(radiusX = 0.15, radiusY = 0.15) {
        this.deadZoneRadiusX = radiusX;
        this.deadZoneRadiusY = radiusY;
    }

    /**
     * Given a target center and the current camera center,
     * returns a new camera center. If the target is inside the dead zone,
     * the camera center does not move.
     */
    public apply(target: Vector2, currentCamera: Vector2): Vector2 {
        const dx = target.x - currentCamera.x;
        const dy = target.y - currentCamera.y;
        
        let newX = currentCamera.x;
        let newY = currentCamera.y;

        if (Math.abs(dx) > this.deadZoneRadiusX) {
            // Move camera just enough to keep target on the edge of the dead zone
            newX = dx > 0 
                ? target.x - this.deadZoneRadiusX 
                : target.x + this.deadZoneRadiusX;
        }

        if (Math.abs(dy) > this.deadZoneRadiusY) {
            newY = dy > 0 
                ? target.y - this.deadZoneRadiusY 
                : target.y + this.deadZoneRadiusY;
        }

        return { x: newX, y: newY };
    }
}
