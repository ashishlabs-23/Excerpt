import { PipelineContext, ViewerSatisfactionResult } from './PipelineContext';

export class ViewerSatisfactionEngine {
  public calculate(clipId: string, context: PipelineContext): ViewerSatisfactionResult {
    const start = Date.now();

    const retention = context.retention?.[clipId]?.retention_score ?? 50;
    const payoff = context.payoff?.[clipId]?.payoff_strength ?? 50;
    const arc = context.emotionIntelligence?.[clipId]?.arc_strength ?? 50;
    const completeness = context.completeness?.[clipId]?.completeness_score ?? 50;

    // Formula: Retention (40%) + Payoff (20%) + EmotionArc (20%) + Completeness (20%)
    const satisfaction_score = Math.round(
      retention * 0.4 +
      payoff * 0.2 +
      arc * 0.2 +
      completeness * 0.2
    );

    const result: ViewerSatisfactionResult = { satisfaction_score };

    if (!context.satisfaction) {
      context.satisfaction = {};
    }
    context.satisfaction[clipId] = result;

    context.executionTimes['ViewerSatisfactionEngine'] = (context.executionTimes['ViewerSatisfactionEngine'] || 0) + (Date.now() - start);

    return result;
  }
}

export const viewerSatisfactionEngine = new ViewerSatisfactionEngine();
