import { PipelineContext } from './PipelineContext';

export interface ClipQualityScore {
  storyQuality: number;
  emotionQuality: number;
  pacingQuality: number;
  boundaryQuality: number;
  editorialQuality: number;
  isPublishable: boolean;
  rejectionReason?: string;
}

export class ClipQualityEngine {
  /**
   * Evaluates the final intended clips before they are rendered to determine
   * if they meet the quality bar. Rejects clips that are sub-par.
   */
  public evaluateClips(context: PipelineContext): void {
    const start = Date.now();
    
    if (!context.topNarratives || context.topNarratives.length === 0) return;

    const MIN_EDITORIAL_QUALITY = 0.65;

    context.topNarratives.forEach(narrative => {
       const situation = context.situations?.find(s => s.id === narrative.situationId);
       
       const storyQuality = narrative.narrativeStrength;
       const emotionQuality = situation?.emotion?.emotionScore || 0;
       
       // Pacing quality favors clips that have a good tension buildup rather than just isolated events
       const tensionArea = situation?.tension?.tensionArea || 0;
       const pacingQuality = Math.min(1.0, tensionArea / 40.0);
       
       // Heuristic boundary quality (will be replaced by ML model trained on BoundaryFailureEngine)
       const hasReplay = (situation?.replays?.replayCount || 0) > 0;
       const boundaryQuality = hasReplay ? 0.9 : 0.7; // Reward including replays
       
       const editorialQuality = (
         (storyQuality * 0.3) +
         (emotionQuality * 0.3) +
         (pacingQuality * 0.2) +
         (boundaryQuality * 0.2)
       );

       let isPublishable = editorialQuality >= MIN_EDITORIAL_QUALITY;
       let rejectionReason = undefined;

       if (!isPublishable) {
          rejectionReason = "Failed editorial quality threshold.";
          if (emotionQuality < 0.3) rejectionReason = "Insufficient emotion/reaction.";
          if (storyQuality < 0.4) rejectionReason = "Weak narrative structure.";
       }

       // In a real implementation, this would be attached to the planned clip
       // For now, we update the publishability score
       narrative.publishabilityScore = editorialQuality;
    });

    // Filter out rejected narratives
    context.topNarratives = context.topNarratives.filter(n => n.publishabilityScore && n.publishabilityScore >= MIN_EDITORIAL_QUALITY);

    context.executionTimes['ClipQualityEngine'] = (context.executionTimes['ClipQualityEngine'] || 0) + (Date.now() - start);
  }
}

export const clipQualityEngine = new ClipQualityEngine();
