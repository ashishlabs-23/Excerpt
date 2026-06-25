import { PipelineContext, NarrativeStructure } from './PipelineContext';

export class NarrativeIntelligenceEngine {
  public analyze(clipId: string, clipStart: number, clipEnd: number, context: PipelineContext): NarrativeStructure {
    const start = Date.now();
    const clipSegments = (context.transcriptSegments || []).filter(
      (s) => s.start >= clipStart && s.end <= clipEnd
    );

    if (clipSegments.length === 0) {
      return { narrative_score: 50 };
    }

    const duration = clipEnd - clipStart;
    
    // Heuristic/algorithmic segment boundary calculation for story phases:
    // setup (0-20%), conflict (20-40%), tension peak (40-60%), reveal (60-75%), payoff (75-90%), conclusion (90-100%)
    const setup_start = clipStart;
    const conflict_start = clipStart + duration * 0.2;
    const tension_peak = clipStart + duration * 0.45;
    const reveal_start = clipStart + duration * 0.65;
    const payoff_start = clipStart + duration * 0.8;
    const conclusion_start = clipStart + duration * 0.9;

    // Analyze transcript keywords to detect story patterns and compute narrative strength
    const fullText = clipSegments.map((s) => s.text).join(' ').toLowerCase();
    
    let narrative_score = 60; // baseline score

    // Story patterns signals
    const patterns = {
      failure_success: ['lost', 'fail', 'broke', 'ruined', 'made it', 'won', 'succeed', 'recovered'],
      mistake_lesson: ['mistake', 'wrong', 'learned', 'lesson', 'realized', 'teach'],
      secret_reveal: ['secret', 'nobody talks', 'weird', 'actually', 'revealed', 'hidden'],
      challenge_victory: ['hard', 'struggle', 'impossible', 'beat', 'victory', 'champion'],
      question_answer: ['why', 'how', 'wondering', 'question', 'answer', 'solve', 'because'],
      before_after: ['before', 'initially', 'used to', 'then', 'now', 'today', 'changed'],
      prediction_outcome: ['predicted', 'expected', 'thought', 'turned out', 'actually', 'result'],
      conflict_resolution: ['disagree', 'argued', 'fight', 'resolved', 'agreed', 'settled']
    };

    let matchedPatterns = 0;
    for (const [_, keywords] of Object.entries(patterns)) {
      const matches = keywords.filter(kw => fullText.includes(kw)).length;
      if (matches >= 2) {
        matchedPatterns++;
        narrative_score += 8;
      }
    }

    // Emotion timeline variance contributes to narrative score
    const emotions = context.commentaryEmotions.filter(
      (e) => e.timestamp >= clipStart && e.timestamp <= clipEnd
    );
    if (emotions.length > 1) {
      const levels = emotions.map(e => e.score);
      const min = Math.min(...levels);
      const max = Math.max(...levels);
      const emotionalSwing = max - min;
      narrative_score += Math.round(emotionalSwing * 15);
    }

    narrative_score = Math.min(100, Math.max(30, narrative_score));

    const result: NarrativeStructure = {
      setup_start: Number(setup_start.toFixed(2)),
      conflict_start: Number(conflict_start.toFixed(2)),
      tension_peak: Number(tension_peak.toFixed(2)),
      reveal_start: Number(reveal_start.toFixed(2)),
      payoff_start: Number(payoff_start.toFixed(2)),
      conclusion_start: Number(conclusion_start.toFixed(2)),
      narrative_score
    };

    if (!context.narrative) {
      context.narrative = {};
    }
    context.narrative[clipId] = result;

    context.executionTimes['NarrativeIntelligenceEngine'] = (context.executionTimes['NarrativeIntelligenceEngine'] || 0) + (Date.now() - start);

    return result;
  }
}

export const narrativeIntelligenceEngine = new NarrativeIntelligenceEngine();
