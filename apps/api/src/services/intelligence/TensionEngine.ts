import { PipelineContext, TensionProfile, DetectedEvent } from './PipelineContext';

export class TensionEngine {
  public process(context: PipelineContext): void {
    const start = Date.now();
    
    if (!context.situations) return;
    
    // Evaluate tension buildup for each situation
    context.situations.forEach(situation => {
      // Find all events within this situation's timeframe
      const relevantEvents = context.events.filter(e => 
        e.start >= situation.start && e.start <= situation.end
      );

      // Simple model: each attacking action adds to tension
      let startTension = 0;
      let peakTension = 0;
      let currentTension = 0;
      let tensionArea = 0;

      relevantEvents.forEach((e, idx) => {
         let stepTension = 0;
         if (['Possession', 'Recovery'].includes(e.type)) stepTension = 0.1;
         if (['Attack', 'Turnover'].includes(e.type)) stepTension = 0.2;
         if (['DangerousAttack', 'CounterAttack', 'SetPiece'].includes(e.type)) stepTension = 0.4;
         if (['Cross', 'Corner'].includes(e.type)) stepTension = 0.5;
         if (e.type === 'Shot') stepTension = 0.8;
         if (e.type === 'Save') stepTension = 0.9;
         if (e.type === 'Goal') stepTension = 1.0;

         if (idx === 0) startTension = stepTension;
         
         currentTension = Math.max(currentTension, stepTension); // In a real model this would decay or compound
         peakTension = Math.max(peakTension, currentTension);
         
         // Approximate area under curve (tension * duration of this event segment)
         const duration = (idx < relevantEvents.length - 1) 
            ? relevantEvents[idx + 1].start - e.start 
            : e.end - e.start;
         
         tensionArea += currentTension * Math.max(1, duration);
      });

      const durationTotal = situation.end - situation.start;
      const growthRate = durationTotal > 0 ? (peakTension - startTension) / durationTotal : 0;

      const tensionProfile: TensionProfile = {
        startTension,
        peakTension,
        growthRate,
        tensionArea
      };

      situation.tension = tensionProfile;
    });

    context.executionTimes['TensionEngine'] = (context.executionTimes['TensionEngine'] || 0) + (Date.now() - start);
  }
}

export const tensionEngine = new TensionEngine();
