import { PipelineContext, Narrative } from './PipelineContext';

export class NarrativeRankingEngine {
  public process(context: PipelineContext): void {
    const start = Date.now();
    
    if (!context.narratives || context.narratives.length === 0) {
      context.topNarratives = [];
      return;
    }

    // Sort narratives by strength descending
    const sortedNarratives = [...context.narratives].sort((a, b) => b.narrativeStrength - a.narrativeStrength);

    // Keep top 3 narratives (or all if less than 3) to reduce graph noise
    context.topNarratives = sortedNarratives.slice(0, 3);

    context.executionTimes['NarrativeRankingEngine'] = (context.executionTimes['NarrativeRankingEngine'] || 0) + (Date.now() - start);
  }
}

export const narrativeRankingEngine = new NarrativeRankingEngine();
