import { FrameTracking, TrackingBox } from './FootballCropAuditor';

export interface StoryEvent {
  type: 'attack' | 'shot' | 'goal' | 'save' | 'celebration' | 'cross' | 'pass';
  start: number; // in seconds
  end: number; // in seconds
}

export interface CropPlan {
  frameIndex: number;
  timestamp: number;
  centerX: number; // 0-1
  centerY: number; // 0-1
  zoom: number; // e.g. 1.0 = no zoom, 1.4 = zoomed
}

export class FootballCropPlanner {
  private readonly MAX_ZOOM_GENERAL = 1.4;
  private readonly MAX_ZOOM_SPECIAL = 1.6;

  /**
   * Plans the crop timeline based on a sequential story of events.
   */
  public planCrop(storyTimeline: StoryEvent[], trackingData: FrameTracking[]): CropPlan[] {
    const plans: CropPlan[] = [];

    for (const frame of trackingData) {
      const currentEvent = this.getCurrentEvent(storyTimeline, frame.timestamp);
      const plan = this.calculateOptimalCropForFrame(frame, currentEvent);
      plans.push(plan);
    }

    // A real implementation would apply a moving average/Kalman filter here 
    // over the 'plans' array to ensure CropStability (anti-jitter) proactively.
    return this.smoothCropPlan(plans);
  }

  private getCurrentEvent(timeline: StoryEvent[], timestamp: number): StoryEvent | null {
    return timeline.find(e => timestamp >= e.start && timestamp <= e.end) || null;
  }

  private calculateOptimalCropForFrame(frame: FrameTracking, event: StoryEvent | null): CropPlan {
    const ball = frame.boxes.find(b => b.label === 'ball');
    const goal = frame.boxes.find(b => b.label === 'goal');
    
    // In a full implementation, we'd find the specific 'shooter' or 'ball carrier' 
    // by evaluating proximity to the ball. We'll use a generic player array for now.
    const players = frame.boxes.filter(b => b.label === 'player');
    
    let targetX = 0.5;
    let targetY = 0.5;
    let targetZoom = 1.0; // Default wide

    const eventType = event ? event.type : 'attack';

    // Base zoom limits
    const maxZoom = ['goal', 'celebration', 'penalty'].includes(eventType) 
      ? this.MAX_ZOOM_SPECIAL 
      : this.MAX_ZOOM_GENERAL;

    if (eventType === 'attack') {
      // Attack: Ball (50%), Ball Carrier (25%), Goal (15%), Nearest Defenders (10%)
      if (ball) {
        targetX = ball.x + (ball.w / 2);
        targetY = ball.y + (ball.h / 2);
        targetZoom = Math.min(1.2, maxZoom); // Keep relatively wide to see passing options
        
        // Goal Geometry Logic: Widen if near penalty box (mocked by proximity to goal if visible)
        if (goal && Math.abs(targetX - (goal.x + goal.w/2)) < 0.3) {
          targetZoom = 1.0; // Widen out in final third
          // Pull target slightly towards goal to show the box
          targetX = targetX * 0.7 + (goal.x + goal.w/2) * 0.3;
        }
      }
    } else if (eventType === 'shot') {
      // Shot: Ball (40%), Goal (40%), Shooter (20%)
      if (ball && goal) {
        const ballCx = ball.x + ball.w / 2;
        const goalCx = goal.x + goal.w / 2;
        
        targetX = ballCx * 0.4 + goalCx * 0.6; // Heavy bias towards seeing where the ball is going
        targetY = goal.y + goal.h / 2; // Keep goal height stable
        targetZoom = Math.min(1.3, maxZoom); 
      } else if (ball) {
        targetX = ball.x + ball.w / 2;
        targetY = ball.y + ball.h / 2;
      }
    } else if (eventType === 'celebration') {
      // Celebration: Scorer (60%), Teammates (25%), Crowd (15%)
      // If no ball, focus heavily on the players grouped together.
      if (players.length > 0) {
        // Average player positions
        const sumX = players.reduce((sum, p) => sum + p.x + p.w / 2, 0);
        const sumY = players.reduce((sum, p) => sum + p.y + p.h / 2, 0);
        targetX = sumX / players.length;
        targetY = sumY / players.length;
        targetZoom = Math.min(1.5, maxZoom); // Tight zoom on emotions
      }
    }

    // Default fallback if tracking fails
    if (!ball && !goal && players.length === 0) {
      targetX = 0.5;
      targetY = 0.5;
      targetZoom = 1.0;
    }

    return {
      frameIndex: frame.frameIndex,
      timestamp: frame.timestamp,
      centerX: targetX,
      centerY: targetY,
      zoom: targetZoom
    };
  }

  private smoothCropPlan(plans: CropPlan[]): CropPlan[] {
    // Basic moving average to prevent severe jitter. 
    // Advanced version would use Kalman filtering and enforce the 15% max jump constraint proactively.
    const smoothed = [...plans];
    const window = 5;
    
    for (let i = 0; i < plans.length; i++) {
      let sumX = 0, sumY = 0, sumZ = 0;
      let count = 0;
      
      for (let j = Math.max(0, i - window); j <= Math.min(plans.length - 1, i + window); j++) {
        sumX += plans[j].centerX;
        sumY += plans[j].centerY;
        sumZ += plans[j].zoom;
        count++;
      }
      
      smoothed[i].centerX = sumX / count;
      smoothed[i].centerY = sumY / count;
      smoothed[i].zoom = sumZ / count;
    }
    
    return smoothed;
  }
}
