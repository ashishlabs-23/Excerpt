import { DetectedEvent, PipelineContext, RankingProfile } from '../PipelineContext';

export interface EventDetector {
  name: string;
  detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]>;
}

export interface BoundaryRule {
  eventType: string; // 'goal', 'wicket', or '*' for fallback
  preRoll: number;   // seconds before event start (positive value, e.g., 5 means subtract 5s)
  postRoll: number;  // seconds after event end (positive value, e.g., 3 means add 3s)
  includeCelebration: boolean;
  includeReplay: boolean;
}

export type ThumbnailPriorityType = 'face' | 'celebration' | 'crowd_reaction' | 'action_event' | 'default';

export interface ThumbnailPriority {
  type: ThumbnailPriorityType;
  weight: number;
}

export abstract class CategoryAdapter {
  abstract readonly category: string;
  abstract getDetectors(): EventDetector[];
  abstract getClipBoundaryRules(): BoundaryRule[];
  abstract getRankingProfile(): RankingProfile;
  abstract getThumbnailPriority(): ThumbnailPriority[];
}
