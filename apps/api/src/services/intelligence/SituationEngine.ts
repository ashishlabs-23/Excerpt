import { PipelineContext, Situation, SituationType, DetectedEvent } from './PipelineContext';

export class SituationEngine {
  public process(context: PipelineContext): void {
    const start = Date.now();
    
    if (!context.situations) {
      context.situations = [];
    }
    
    if (!context.events || context.events.length === 0) {
      return;
    }

    const events = [...context.events].sort((a, b) => a.start - b.start);
    const situations: Situation[] = [];

    // Extract context from orchestration if available
    const scoreboardData = (context as any).orch_scoreboard || {};
    const baseSituationContext = {
      minute: scoreboardData.minute || Math.floor(Math.random() * 90),
      scoreDiff: scoreboardData.score_diff !== undefined ? scoreboardData.score_diff : 0,
      matchState: scoreboardData.match_state || 'playing',
      aggregateScore: scoreboardData.aggregate_score || undefined,
      redCards: scoreboardData.red_cards || 0,
      competition: scoreboardData.competition || 'Premier League',
      isKnockout: scoreboardData.is_knockout || false,
      isExtraTime: scoreboardData.is_extra_time || false,
      isPenaltyShootout: scoreboardData.is_penalty_shootout || false,
      homeTeam: scoreboardData.home_team || 'Home',
      awayTeam: scoreboardData.away_team || 'Away'
    };

    // Simple heuristic pattern matching to find Situations
    for (let i = 0; i < events.length; i++) {
      const currentEvent = events[i];

      // Pattern 1: Counter Attack
      // Turnover -> Attack/Shot within 15 seconds
      if (['Turnover', 'Recovery'].includes(currentEvent.type)) {
        for (let j = i + 1; j < events.length; j++) {
          const nextEvent = events[j];
          if (nextEvent.start - currentEvent.end > 15) break;
          
          if (['Attack', 'Shot', 'Goal'].includes(nextEvent.type)) {
            situations.push({
              id: `Situation_CounterAttack_${currentEvent.start}`,
              type: 'CounterAttack',
              start: currentEvent.start,
              end: nextEvent.end,
              confidence: (currentEvent.confidence + nextEvent.confidence) / 2,
              relatedEventIds: [currentEvent.type, nextEvent.type],
              context: { ...baseSituationContext }
            });
            break;
          }
        }
      }

      // Pattern 2: Set Piece
      // Foul/Card -> Attack/Cross/Shot within 30 seconds
      if (['Foul', 'Card'].includes(currentEvent.type)) {
        for (let j = i + 1; j < events.length; j++) {
          const nextEvent = events[j];
          if (nextEvent.start - currentEvent.end > 30) break;
          
          if (['Attack', 'Cross', 'Shot', 'Goal'].includes(nextEvent.type)) {
            situations.push({
              id: `Situation_SetPiece_${currentEvent.start}`,
              type: 'SetPiece',
              start: currentEvent.start,
              end: nextEvent.end,
              confidence: 0.8,
              relatedEventIds: [],
              context: { ...baseSituationContext }
            });
            break;
          }
        }
      }

      // Pattern 3: Penalty Sequence
      // Foul -> Shot (with high tension/wait)
      if (currentEvent.type === 'Foul') {
        let hasShot = false;
        let hasReaction = false;
        let penaltyEnd = currentEvent.end;
        for (let j = i + 1; j < events.length; j++) {
          const nextEvent = events[j];
          if (nextEvent.start - currentEvent.end > 60) break; // Penalties take a while
          if (nextEvent.type === 'Shot' || nextEvent.type === 'Goal') {
             hasShot = true;
             penaltyEnd = nextEvent.end;
          }
          if (hasShot && nextEvent.type.includes('Reaction')) {
             hasReaction = true;
             penaltyEnd = nextEvent.end;
             break;
          }
        }
        if (hasShot && hasReaction) {
           situations.push({
              id: `Situation_PenaltySequence_${currentEvent.start}`,
              type: 'PenaltySequence',
              start: currentEvent.start,
              end: penaltyEnd,
              confidence: 0.9,
              relatedEventIds: [],
              context: { ...baseSituationContext }
           });
        }
      }

      // Pattern 4: Pressure Wave
      // 3+ attacking events (Attack, Cross, Shot, Corner) within 45 seconds
      if (['Attack', 'Cross', 'Shot'].includes(currentEvent.type)) {
         let attackCount = 1;
         let waveEnd = currentEvent.end;
         for (let j = i + 1; j < events.length; j++) {
            const nextEvent = events[j];
            if (nextEvent.start - currentEvent.end > 45) break;
            if (['Attack', 'Cross', 'Shot'].includes(nextEvent.type)) {
               attackCount++;
               waveEnd = nextEvent.end;
            }
         }
         if (attackCount >= 3) {
            // Found a pressure wave! Jump forward so we don't count overlapping waves too much
            situations.push({
              id: `Situation_PressureWave_${currentEvent.start}`,
              type: 'PressureWave',
              start: currentEvent.start,
              end: waveEnd,
              confidence: Math.min(1.0, 0.5 + (attackCount * 0.1)),
              relatedEventIds: [],
              context: { ...baseSituationContext }
            });
            // We could advance `i`, but let's keep it simple
         }
      }

      // Additional logic for VAR Review and Dangerous Attack can be added similarly
      if (currentEvent.type === 'Attack') {
         for (let j = i + 1; j < events.length; j++) {
            const nextEvent = events[j];
            if (nextEvent.start - currentEvent.end > 10) break;
            if (['Shot', 'Cross', 'Goal'].includes(nextEvent.type)) {
               situations.push({
                 id: `Situation_DangerousAttack_${currentEvent.start}`,
                 type: 'DangerousAttack',
                 start: currentEvent.start,
                 end: nextEvent.end,
                 confidence: 0.85,
                 relatedEventIds: [],
                 context: { ...baseSituationContext }
               });
               break;
            }
         }
      }
    }

    // Deduplicate situations roughly by time overlap
    const deduplicatedSituations: Situation[] = [];
    for (const sit of situations) {
      const isDuplicate = deduplicatedSituations.some(
        (existing) => 
          existing.type === sit.type && 
          Math.abs(existing.start - sit.start) < 10
      );
      if (!isDuplicate) {
        deduplicatedSituations.push(sit);
      }
    }

    context.situations = deduplicatedSituations;

    context.executionTimes['SituationEngine'] = (context.executionTimes['SituationEngine'] || 0) + (Date.now() - start);
  }
}

export const situationEngine = new SituationEngine();
