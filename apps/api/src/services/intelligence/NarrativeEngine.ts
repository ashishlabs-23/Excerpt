import { PipelineContext, Narrative, NarrativeType, Situation } from './PipelineContext';

export class NarrativeEngine {
  public process(context: PipelineContext): void {
    const start = Date.now();
    
    if (!context.narratives) {
      context.narratives = [];
    }
    
    if (!context.situations || context.situations.length === 0) {
      return;
    }

    const narratives: Narrative[] = [];

    // Analyze each situation to map it to a Narrative
    for (const situation of context.situations) {
      const sitCtx = situation.context;
      if (!sitCtx) continue;

      // Check if it ends in a goal
      const eventsInSit = context.events.filter(e => e.start >= situation.start - 5 && e.end <= situation.end + 5);
      const hasGoal = eventsInSit.some(e => e.type === 'Goal');
      const hasSave = eventsInSit.some(e => e.type === 'Save');
      const hasMiss = eventsInSit.some(e => e.type === 'Miss');
      const hasCrowd = eventsInSit.some(e => e.type === 'CrowdReaction');
      const hasReaction = eventsInSit.some(e => e.type.includes('Reaction'));

      let narrativeType: NarrativeType | null = null;
      let strength = 0.5; // Base strength

      // Late Winner
      if (hasGoal && sitCtx.minute >= 85 && sitCtx.scoreDiff === 0) {
        narrativeType = 'LateWinner';
        strength = 0.95 + (sitCtx.isKnockout ? 0.05 : 0);
      }
      // Equalizer
      else if (hasGoal && sitCtx.scoreDiff === -1) {
        narrativeType = 'Equalizer';
        strength = sitCtx.minute > 80 ? 0.90 : 0.70;
      }
      // Comeback (if they were down by 2 or more and now scored)
      else if (hasGoal && sitCtx.scoreDiff <= -2) {
        narrativeType = 'Comeback';
        strength = 0.85;
      }
      // Last Minute Heartbreak
      else if (hasMiss && sitCtx.minute >= 88 && sitCtx.scoreDiff === -1) {
        narrativeType = 'LastMinuteHeartbreak';
        strength = 0.92;
      }
      // Goalkeeper Masterclass
      else if (hasSave && (situation.type === 'PressureWave' || situation.type === 'PenaltySequence')) {
        narrativeType = 'GoalkeeperMasterclass';
        strength = 0.88;
      }
      // Tactical Masterclass
      else if (hasGoal && situation.type === 'CounterAttack') {
        narrativeType = 'TacticalMasterclass';
        strength = 0.75;
      }
      // Crowd Eruption
      else if (hasCrowd && (situation.type === 'PressureWave' || hasGoal)) {
        narrativeType = 'CrowdEruption';
        strength = 0.82;
      }
      // Default to something
      else if (hasGoal) {
         // Just a standard goal, no special narrative
      }

      if (narrativeType) {
         // Boost strength if there's a lot of reaction
         if (hasReaction) {
            strength += 0.05;
         }
         
         narratives.push({
           id: `Narrative_${narrativeType}_${situation.id}`,
           type: narrativeType,
           confidence: 0.9,
           narrativeStrength: Math.min(1.0, strength),
           situationId: situation.id,
           supportingEventIds: eventsInSit.map(e => e.type),
           supportingSituationIds: [situation.id]
         });
      }
    }

    context.narratives = narratives;
    context.executionTimes['NarrativeEngine'] = (context.executionTimes['NarrativeEngine'] || 0) + (Date.now() - start);
  }
}

export const narrativeEngine = new NarrativeEngine();
