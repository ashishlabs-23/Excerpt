import { PipelineContext, Situation, DetectedEvent } from './PipelineContext';

export interface ReplayProfile {
  replayStart: number;
  replayEnd: number;
  replayCount: number;
  replayImportance: number;
}

export class ReplaySequenceEngine {
  public process(context: PipelineContext): void {
    const start = Date.now();
    
    if (!context.situations || !context.events) return;
    
    // Group adjacent or nearby 'Replay' events into sequences
    const replayEvents = context.events.filter(e => e.type === 'Replay').sort((a, b) => a.start - b.start);
    
    // Evaluate replays for each situation
    context.situations.forEach(situation => {
      // Find replays that happen shortly after the situation ends
      // Typically within 30-45 seconds of the goal/action
      const subsequentReplays = replayEvents.filter(e => 
        e.start >= situation.end && e.start <= situation.end + 45
      );

      if (subsequentReplays.length > 0) {
         let replayStart = subsequentReplays[0].start;
         let replayEnd = subsequentReplays[subsequentReplays.length - 1].end;
         let replayCount = subsequentReplays.length;
         
         // Calculate a basic importance heuristic based on how many replays there are
         // and their proximity to highly emotional situations.
         let replayImportance = Math.min(1.0, replayCount * 0.3 + (situation.emotion?.emotionScore || 0) * 0.5);

         situation.replays = {
            replayStart,
            replayEnd,
            replayCount,
            replayImportance
         };
      }
    });

    context.executionTimes['ReplaySequenceEngine'] = (context.executionTimes['ReplaySequenceEngine'] || 0) + (Date.now() - start);
  }
}

export const replaySequenceEngine = new ReplaySequenceEngine();
