import { PipelineContext, EmotionProfile, DetectedEvent } from './PipelineContext';

export class EmotionEngine {
  public process(context: PipelineContext): void {
    const start = Date.now();
    
    if (!context.situations) return;
    
    // Evaluate emotion for each situation
    context.situations.forEach(situation => {
      // Find all events that overlap with or immediately follow the situation
      const relevantEvents = context.events.filter(e => 
        e.start >= situation.start - 5 && e.start <= situation.end + 20
      );
      
      let crowdEruption = 0;
      let commentatorExcitement = 0;
      let playerCelebration = 0;
      let benchReaction = 0;
      let managerReaction = 0;

      relevantEvents.forEach(e => {
        if (e.type === 'CrowdReaction') crowdEruption += e.confidence;
        if (e.type === 'PlayerReaction') playerCelebration += e.confidence;
        if (e.type === 'BenchReaction') benchReaction += e.confidence;
        if (e.type === 'ManagerReaction') managerReaction += e.confidence;
      });

      // Also incorporate commentary emotion if available
      if (context.commentaryEmotions) {
        const commEmotions = context.commentaryEmotions.filter(ce => 
           ce.timestamp >= situation.start && ce.timestamp <= situation.end + 20
        );
        commentatorExcitement = commEmotions.reduce((acc, curr) => acc + curr.score, 0) / (commEmotions.length || 1);
      }

      // Cap at 1.0
      crowdEruption = Math.min(1.0, crowdEruption);
      playerCelebration = Math.min(1.0, playerCelebration);
      benchReaction = Math.min(1.0, benchReaction);
      managerReaction = Math.min(1.0, managerReaction);

      // Emotion score is a weighted combination
      const emotionScore = (
        (crowdEruption * 0.4) +
        (commentatorExcitement * 0.3) +
        (playerCelebration * 0.15) +
        (managerReaction * 0.1) +
        (benchReaction * 0.05)
      );

      const emotionProfile: EmotionProfile = {
        crowdEruption,
        commentatorExcitement,
        playerCelebration,
        benchReaction,
        managerReaction,
        emotionScore: Math.min(1.0, emotionScore)
      };

      situation.emotion = emotionProfile;
    });

    context.executionTimes['EmotionEngine'] = (context.executionTimes['EmotionEngine'] || 0) + (Date.now() - start);
  }
}

export const emotionEngine = new EmotionEngine();
