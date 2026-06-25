import { PipelineContext, CuriosityResult } from './PipelineContext';

export class CuriosityGapEngine {
  public analyze(clipId: string, clipStart: number, clipEnd: number, context: PipelineContext): CuriosityResult {
    const start = Date.now();
    const clipSegments = (context.transcriptSegments || []).filter(
      (s) => s.start >= clipStart && s.end <= clipEnd
    );

    if (clipSegments.length === 0) {
      return { curiosity_score: 50 };
    }

    const fullText = clipSegments.map((s) => s.text).join(' ').toLowerCase();
    let curiosity_score = 50; // default baseline

    // Hook curiosity phrases (first 5 seconds of the clip)
    const hookSegments = clipSegments.filter(s => s.start < clipStart + 5.0);
    const hookText = hookSegments.map(s => s.text).join(' ').toLowerCase();

    const openLoopPhrases = [
      'nobody talks about',
      'i found something weird',
      'this changed everything',
      'this mistake cost me',
      'never do this',
      'the secret to',
      'if you want to know',
      'i lost',
      'why you should never',
      'shocking truth',
      'here is what happened',
      'here is why'
    ];

    for (const phrase of openLoopPhrases) {
      if (hookText.includes(phrase)) {
        curiosity_score += 20;
      } else if (fullText.includes(phrase)) {
        curiosity_score += 8;
      }
    }

    // Unanswered questions: check for question marks or question words near the start
    const questionWords = ['why', 'how', 'what if', 'could it be', 'have you ever'];
    const hasQuestion = questionWords.some(qw => hookText.includes(qw)) || hookText.includes('?');
    if (hasQuestion) {
      curiosity_score += 15;
    }

    // Limit ranges
    curiosity_score = Math.min(100, Math.max(0, curiosity_score));

    const result: CuriosityResult = { curiosity_score };

    if (!context.curiosity) {
      context.curiosity = {};
    }
    context.curiosity[clipId] = result;

    context.executionTimes['CuriosityGapEngine'] = (context.executionTimes['CuriosityGapEngine'] || 0) + (Date.now() - start);

    return result;
  }
}

export const curiosityGapEngine = new CuriosityGapEngine();
