import { VideoIntelligenceGraph } from './VideoGraph';
import { EventGraph, EventNode, EventType } from './EventGraph';
import crypto from 'crypto';

export class EventGraphBuilder {
  
  /**
   * Distills the dense VideoIntelligenceGraph into a causal EventGraph.
   */
  public build(vig: VideoIntelligenceGraph): EventGraph {
    const graph = new EventGraph();
    let previousSpeaker = '';
    
    // 1. Map Semantic Events to EventGraph
    for (const semantic of vig.semanticEvents || []) {
      graph.addEvent({
        id: crypto.randomUUID(),
        type: this.mapSemanticToEventType(semantic.type),
        timestamp: semantic.timeStart,
        duration: semantic.timeEnd - semantic.timeStart,
        confidence: 0.9,
        importance: semantic.intensity,
        description: `Detected semantic event: ${semantic.type}`,
        characters: []
      });
    }

    // 2. Map Transcript to Conversational Events (Questions, Answers, Interruption)
    for (const sentence of vig.transcript || []) {
      const text = sentence.text.toLowerCase();
      let type: EventType = 'UNKNOWN';
      let importance = 0.3;

      if (text.includes('?')) {
        type = 'QUESTION';
        importance = 0.8;
      } else if (previousSpeaker && sentence.speaker && previousSpeaker !== sentence.speaker) {
        // Did they interrupt? Check if time gap is extremely small (< 0.5s)
        const timeGap = sentence.start - (vig.transcript.find(s => s.speaker === previousSpeaker)?.end || 0);
        if (timeGap < 0.5 && timeGap > -1) {
          type = 'INTERRUPTION';
          importance = 0.7;
        } else {
          type = 'ANSWER'; // Assumption based on turn-taking
          importance = 0.6;
        }
      }

      if (type !== 'UNKNOWN') {
        graph.addEvent({
          id: crypto.randomUUID(),
          type,
          timestamp: sentence.start,
          duration: sentence.end - sentence.start,
          confidence: 0.8,
          importance,
          description: `Transcript segment: "${sentence.text}"`,
          characters: sentence.speaker ? [sentence.speaker] : []
        });
      }

      previousSpeaker = sentence.speaker || '';
    }

    // 3. Map Audio Spikes to Events (Laughter/Crowd Explosion/Silence)
    let silenceStart = -1;
    for (const audio of vig.audio || []) {
      if (audio.energy > 0.85) {
        // High energy spike -> could be Laughter or Crowd Explosion based on category
        const type: EventType = (vig.category === 'football' || vig.category === 'cricket') ? 'CROWD_EXPLOSION' : 'LAUGHTER';
        graph.addEvent({
          id: crypto.randomUUID(),
          type,
          timestamp: audio.time,
          duration: audio.duration,
          confidence: 0.7,
          importance: audio.energy,
          description: `Audio energy spike: ${audio.energy.toFixed(2)}`,
          characters: []
        });
      } else if (audio.isSilence) {
        if (silenceStart === -1) silenceStart = audio.time;
      } else {
        if (silenceStart !== -1) {
          const duration = audio.time - silenceStart;
          if (duration > 3.0) { // Significant silence
            graph.addEvent({
              id: crypto.randomUUID(),
              type: 'SILENCE',
              timestamp: silenceStart,
              duration: duration,
              confidence: 0.9,
              importance: 0.5,
              description: `Prolonged silence for ${duration.toFixed(1)}s`,
              characters: []
            });
          }
          silenceStart = -1;
        }
      }
    }

    // 4. Infer Causal Links (e.g., Question -> Answer)
    const sortedEvents = Array.from(graph.events.values()).sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 0; i < sortedEvents.length - 1; i++) {
      const e1 = sortedEvents[i];
      const e2 = sortedEvents[i + 1];

      // Time gap between events
      const gap = e2.timestamp - (e1.timestamp + e1.duration);

      if (gap >= 0 && gap < 5.0) {
        if (e1.type === 'QUESTION' && e2.type === 'ANSWER') {
          graph.addLink({ sourceEventId: e1.id, targetEventId: e2.id, relationship: 'ANSWERS' });
        } else if (e2.type === 'LAUGHTER' || e2.type === 'CROWD_EXPLOSION' || e2.type === 'REACTION') {
          graph.addLink({ sourceEventId: e1.id, targetEventId: e2.id, relationship: 'REACTS_TO' });
        } else if (e1.type === 'SHOT' && e2.type === 'GOAL') {
          graph.addLink({ sourceEventId: e1.id, targetEventId: e2.id, relationship: 'CAUSES' });
        } else {
          graph.addLink({ sourceEventId: e1.id, targetEventId: e2.id, relationship: 'FOLLOWS' });
        }
      }
    }

    return graph;
  }

  private mapSemanticToEventType(rawType: string): EventType {
    const t = rawType.toUpperCase();
    if (['GOAL', 'SHOT', 'SAVE', 'QUESTION', 'ANSWER', 'JOKE', 'LAUGHTER', 'INTERRUPTION', 'SILENCE', 'REACTION'].includes(t)) {
      return t as EventType;
    }
    if (t === 'CROWD_ROAR') return 'CROWD_EXPLOSION';
    return 'UNKNOWN';
  }
}
