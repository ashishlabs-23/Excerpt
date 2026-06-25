export type EventType =
  | 'GOAL'
  | 'SHOT'
  | 'SAVE'
  | 'CROWD_EXPLOSION'
  | 'QUESTION'
  | 'ANSWER'
  | 'JOKE'
  | 'LAUGHTER'
  | 'INTERRUPTION'
  | 'SILENCE'
  | 'CAMERA_CHANGE'
  | 'ZOOM'
  | 'REACTION'
  | 'UNKNOWN';

export interface EventNode {
  id: string;
  type: EventType;
  timestamp: number; // Start time in seconds
  duration: number;
  confidence: number;
  importance: number; // 0 to 1
  description: string;
  characters: string[]; // Track IDs or speaker IDs involved
}

export interface CausalLink {
  sourceEventId: string;
  targetEventId: string;
  relationship: 'CAUSES' | 'FOLLOWS' | 'REACTS_TO' | 'ANSWERS' | 'INTERRUPTS';
}

export class EventGraph {
  public events: Map<string, EventNode> = new Map();
  public links: CausalLink[] = [];

  public addEvent(event: EventNode) {
    this.events.set(event.id, event);
  }

  public addLink(link: CausalLink) {
    this.links.push(link);
  }

  public getEventsInRange(start: number, end: number): EventNode[] {
    return Array.from(this.events.values()).filter(
      (e) => e.timestamp >= start && (e.timestamp + e.duration) <= end
    );
  }
}
