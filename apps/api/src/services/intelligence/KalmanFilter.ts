import { Vector2 } from './SpatialIntelligenceTypes';

/**
 * A simplified 1D Kalman Filter for motion prediction.
 */
class Kalman1D {
    private x: number; // State (Position)
    private p: number; // Estimate uncertainty
    private q: number; // Process noise
    private r: number; // Measurement noise
    private k: number; // Kalman gain

    constructor(initialX: number, q: number = 0.01, r: number = 0.1) {
        this.x = initialX;
        this.p = 1.0;
        this.q = q;
        this.r = r;
        this.k = 0;
    }

    public predict(velocity: number, dt: number): void {
        // State extrapolation
        this.x = this.x + (velocity * dt);
        // Covariance extrapolation
        this.p = this.p + this.q;
    }

    public update(measurement: number): number {
        // Kalman Gain computation
        this.k = this.p / (this.p + this.r);
        // State update
        this.x = this.x + this.k * (measurement - this.x);
        // Covariance update
        this.p = (1 - this.k) * this.p;
        
        return this.x;
    }
    
    public getState(): number {
        return this.x;
    }
}

export class KalmanFilter2D {
    private filterX: Kalman1D;
    private filterY: Kalman1D;

    constructor(initialX: number, initialY: number, q: number = 0.01, r: number = 0.1) {
        this.filterX = new Kalman1D(initialX, q, r);
        this.filterY = new Kalman1D(initialY, q, r);
    }

    /**
     * Predicts the next state based on current velocity.
     */
    public predict(velocity: Vector2, dt: number): Vector2 {
        this.filterX.predict(velocity.x, dt);
        this.filterY.predict(velocity.y, dt);
        return { x: this.filterX.getState(), y: this.filterY.getState() };
    }

    /**
     * Updates the filter with an actual measurement and returns the filtered position.
     */
    public update(measurement: Vector2): Vector2 {
        return {
            x: this.filterX.update(measurement.x),
            y: this.filterY.update(measurement.y)
        };
    }
}
