import { EventGraph, EventNode } from './EventGraph';
import { VideoIntelligenceGraph } from './VideoGraph';

export class SemanticSegmenter {
  
  /**
   * Chunks the EventGraph logically based on video category.
   * Returns an array of event chunks (each chunk is an array of EventNodes).
   */
  public segment(vig: VideoIntelligenceGraph, eventGraph: EventGraph): EventNode[][] {
    const chunks: EventNode[][] = [];
    const events = Array.from(eventGraph.events.values()).sort((a, b) => a.timestamp - b.timestamp);
    
    if (events.length === 0) return chunks;

    const category = vig.category.toLowerCase();
    
    let chunkMaxDuration = 180; // Default 3 minutes
    let semanticBreakEvents: string[] = ['SILENCE', 'CAMERA_CHANGE'];

    // Platform/Category specific adaptive chunking
    if (category === 'football' || category === 'cricket') {
      chunkMaxDuration = 90; // 90 seconds
      semanticBreakEvents = ['SILENCE', 'GOAL', 'SHOT']; // A shot/goal naturally ends a chunk
    } else if (category === 'podcast' || category === 'interview') {
      chunkMaxDuration = 240; // 4 minutes
      semanticBreakEvents = ['SILENCE', 'INTERRUPTION']; 
    }

    let currentChunk: EventNode[] = [];
    let chunkStartTime = events[0].timestamp;

    for (const event of events) {
      currentChunk.push(event);

      const durationSoFar = event.timestamp - chunkStartTime;
      
      // If we've passed the minimum duration, look for a semantic break
      if (durationSoFar > (chunkMaxDuration * 0.5) && semanticBreakEvents.includes(event.type)) {
        chunks.push(currentChunk);
        currentChunk = [];
        chunkStartTime = event.timestamp + event.duration;
      } 
      // If we've hit the absolute maximum duration, hard break to prevent LLM context overflow
      else if (durationSoFar > chunkMaxDuration) {
        chunks.push(currentChunk);
        currentChunk = [];
        chunkStartTime = event.timestamp + event.duration;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }
}
