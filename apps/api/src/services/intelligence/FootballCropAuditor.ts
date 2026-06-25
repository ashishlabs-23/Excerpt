import { CropPlan, StoryEvent } from './FootballCropPlanner';

export interface TrackingBox {
  x: number; // 0-1 normalized
  y: number; // 0-1 normalized
  w: number; // 0-1 normalized
  h: number; // 0-1 normalized
  label: 'ball' | 'player' | 'goal' | 'goalkeeper' | 'referee';
  confidence: number;
}

export interface FrameTracking {
  frameIndex: number;
  timestamp: number;
  boxes: TrackingBox[];
}

export interface CropAuditResult {
  passed: boolean;
  issues: string[];
  metrics: {
    actionCoverageScore: number;
    cropStabilityScore: number;
    tacticalContextScore: number;
    storyCoverageScore: number;
    ballVisibilityScore: number;
    goalVisibilityScore: number;
  };
}

export class FootballCropAuditor {
  private MAX_JUMP_THRESHOLD = 0.15; // 15% of frame width

  public evaluateCropPlan(plans: CropPlan[], trackingData: FrameTracking[], storyTimeline: StoryEvent[]): CropAuditResult {
    let ballFrames = 0;
    let ballVisibleFrames = 0;
    
    let goalFrames = 0;
    let goalVisibleFrames = 0;

    let jumpFails = 0;

    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const frame = trackingData.find(f => f.frameIndex === plan.frameIndex);
      if (!frame) continue;

      const event = storyTimeline.find(e => plan.timestamp >= e.start && plan.timestamp <= e.end);
      const isShot = event?.type === 'shot';

      // 1. Crop Stability Check
      if (i > 0) {
        const prevPlan = plans[i - 1];
        const jumpDistance = Math.abs(plan.centerX - prevPlan.centerX);
        
        if (jumpDistance > this.MAX_JUMP_THRESHOLD && !isShot) {
          jumpFails++;
        }
      }

      // Base Visibility Checks (Assuming a standard 9:16 crop window calculation from the center and zoom)
      // For simplicity, we just check if the subject is within a conceptual bounding box 
      // representing the crop width/height in normalized coordinates.
      const cropWidth = 0.5625 / plan.zoom; // 9/16 ratio approximate normalized width
      const cropHeight = 1.0 / plan.zoom;
      
      const cropMinX = plan.centerX - cropWidth / 2;
      const cropMaxX = plan.centerX + cropWidth / 2;
      const cropMinY = plan.centerY - cropHeight / 2;
      const cropMaxY = plan.centerY + cropHeight / 2;

      const ball = frame.boxes.find(b => b.label === 'ball');
      const goal = frame.boxes.find(b => b.label === 'goal');

      if (ball) {
        ballFrames++;
        const ballCx = ball.x + ball.w / 2;
        const ballCy = ball.y + ball.h / 2;
        if (ballCx >= cropMinX && ballCx <= cropMaxX && ballCy >= cropMinY && ballCy <= cropMaxY) {
          ballVisibleFrames++;
        }
      }

      if (goal) {
        goalFrames++;
        const goalCx = goal.x + goal.w / 2;
        if (goalCx >= cropMinX && goalCx <= cropMaxX) {
          goalVisibleFrames++;
        }
      }
    }

    const ballVisibilityScore = ballFrames > 0 ? (ballVisibleFrames / ballFrames) * 100 : 100;
    const goalVisibilityScore = goalFrames > 0 ? (goalVisibleFrames / goalFrames) * 100 : 100;
    
    // Stability Score calculation
    const cropStabilityScore = Math.max(0, 100 - (jumpFails * 5)); // Penalize 5 points per extreme jump

    // Mock calculations for advanced context logic which requires deep event analysis
    const actionCoverageScore = this.calculateActionCoverage(storyTimeline, trackingData, plans);
    const tacticalContextScore = this.calculateTacticalContext(storyTimeline, trackingData, plans);
    const storyCoverageScore = this.calculateStoryCoverage(storyTimeline);

    const issues: string[] = [];
    if (cropStabilityScore < 70) issues.push(`Crop stability is poor (Score: ${cropStabilityScore})`);
    if (actionCoverageScore < 70) issues.push(`Action coverage is inadequate (Score: ${actionCoverageScore})`);

    // SOFT FAIL MODE: For V1, we do NOT reject clips. We only score them.
    return {
      passed: true, // Always pass for data collection phase
      issues,
      metrics: {
        actionCoverageScore,
        cropStabilityScore,
        tacticalContextScore,
        storyCoverageScore,
        ballVisibilityScore,
        goalVisibilityScore
      }
    };
  }

  private calculateActionCoverage(timeline: StoryEvent[], tracking: FrameTracking[], plans: CropPlan[]): number {
    // In a full implementation, we'd cross-reference the visible bounding boxes within the crop plans
    // against the required entities per event (e.g. Passer + Receiver + Ball).
    return 85.0; // Mock score for V1 framework
  }

  private calculateTacticalContext(timeline: StoryEvent[], tracking: FrameTracking[], plans: CropPlan[]): number {
    // Mock tactical context. Evaluates if passing options/goalkeepers are visibly maintained.
    return 78.0; 
  }

  private calculateStoryCoverage(timeline: StoryEvent[]): number {
    // A football clip needs buildup, assist, shot, goal, celebration.
    // If any are completely absent from the event timeline, story coverage drops.
    const hasBuildup = timeline.some(t => t.type === 'attack');
    const hasShot = timeline.some(t => t.type === 'shot');
    const hasGoal = timeline.some(t => t.type === 'goal');
    
    let score = 100;
    if (!hasBuildup) score -= 20;
    if (!hasShot && hasGoal) score -= 50; // Unacceptable to miss the shot if there's a goal
    return score;
  }
}
