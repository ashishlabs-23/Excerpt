import { PipelineContext } from './PipelineContext';

export class EditorialPreferenceEngine {
  public process(context: PipelineContext): void {
    const start = Date.now();
    
    if (!context.narratives || context.narratives.length === 0) {
      context.topNarratives = [];
      return;
    }

    // Weight parameters for publishability score
    const NARRATIVE_WEIGHT = 0.4;
    const EMOTION_WEIGHT = 0.4;
    const TENSION_WEIGHT = 0.2;

    // Evaluate each narrative
    context.narratives.forEach(narrative => {
       // Find its parent situation to extract emotion and tension
       const situation = context.situations?.find(s => s.id === narrative.situationId);
       
       if (situation) {
          // Normalize tension area (assuming max around 50 for a crazy sequence, heuristic)
          const normalizedTension = Math.min(1.0, (situation.tension?.tensionArea || 0) / 50.0);
          
          const emotionScore = situation.emotion?.emotionScore || 0;
          
          narrative.publishabilityScore = (
             (narrative.narrativeStrength * NARRATIVE_WEIGHT) +
             (emotionScore * EMOTION_WEIGHT) +
             (normalizedTension * TENSION_WEIGHT)
          );
       } else {
          narrative.publishabilityScore = narrative.narrativeStrength * NARRATIVE_WEIGHT;
       }
    });

    // Sort narratives by publishabilityScore descending
    const sortedNarratives = [...context.narratives].sort((a, b) => 
       (b.publishabilityScore || 0) - (a.publishabilityScore || 0)
    );

    // Keep top 3 narratives
    context.topNarratives = sortedNarratives.slice(0, 3);

    context.executionTimes['EditorialPreferenceEngine'] = (context.executionTimes['EditorialPreferenceEngine'] || 0) + (Date.now() - start);
  }
}

export const editorialPreferenceEngine = new EditorialPreferenceEngine();
