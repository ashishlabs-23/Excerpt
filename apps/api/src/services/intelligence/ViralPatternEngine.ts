import { PipelineContext, ViralPatternResult } from './PipelineContext';

export class ViralPatternEngine {
  public classify(clipId: string, clipStart: number, clipEnd: number, context: PipelineContext): ViralPatternResult {
    const start = Date.now();
    const clipSegments = (context.transcriptSegments || []).filter(
      (s) => s.start >= clipStart && s.end <= clipEnd
    );

    const fullText = clipSegments.map(s => s.text).join(' ').toLowerCase();
    const category = context.category.category;

    // Pattern definitions with keyword matching
    const patterns = [
      {
        name: 'Secret Reveal',
        keywords: ['secret', 'nobody talks', 'hidden', 'reveal', 'whisper', 'truth about'],
        performance: 88
      },
      {
        name: 'Contrarian Opinion',
        keywords: ['disagree', 'wrong', 'lie', 'actually', 'fake', 'scam', 'nonsense'],
        performance: 85
      },
      {
        name: 'Failure Story',
        keywords: ['failed', 'lost', 'broke', 'ruined', 'destroyed', 'mistake', 'blew it'],
        performance: 82
      },
      {
        name: 'Transformation Story',
        keywords: ['before', 'after', 'changed', 'transformed', 'became', 'journey', 'evolved'],
        performance: 90
      },
      {
        name: 'Underdog Win',
        keywords: ['nobody believed', 'struggling', 'beat all odds', 'victory', 'won against', 'impossible'],
        performance: 92
      },
      {
        name: 'Massive Mistake',
        keywords: ['mistake', 'regret', 'should not have', 'warning', 'never do this', 'terrible decision'],
        performance: 87
      },
      {
        name: 'Shocking Fact',
        keywords: ['did you know', 'shocking', 'unbelievable', 'fact', 'surprising', 'statistically'],
        performance: 84
      },
      {
        name: 'Expert Insight',
        keywords: ['here is the key', 'framework', 'strategy', 'how to', 'expert', 'tip', 'advice'],
        performance: 80
      },
      {
        name: 'Emotional Confession',
        keywords: ['i feel', 'honestly', 'scared', 'sad', 'crying', 'hurt', 'confess', 'admit'],
        performance: 86
      },
      {
        name: 'Unexpected Twist',
        keywords: ['suddenly', 'twist', 'expected', 'instead', 'turns out', 'out of nowhere'],
        performance: 89
      },
      {
        name: 'Comeback Story',
        keywords: ['comeback', 'returned', 'recovered', 'rebound', 'again', 'rise'],
        performance: 91
      },
      {
        name: 'Clutch Sports Moment',
        keywords: ['clutch', 'last second', 'buzzer', 'winner', 'save', 'miracle'],
        performance: 95
      },
      {
        name: 'Historic Achievement',
        keywords: ['record', 'historic', 'history', 'champion', 'first time', 'legendary'],
        performance: 94
      }
    ];

    let bestPattern = 'Expert Insight';
    let maxConfidence = 30; // default baseline confidence

    // Special category routing
    if (category === 'football' || category === 'cricket' || category === 'basketball' || category === 'mma') {
      const hasWowMoment = (context.wowMoments || []).some(
        (w) => w.timestamp >= clipStart && w.timestamp <= clipEnd
      );
      if (hasWowMoment) {
        bestPattern = 'Clutch Sports Moment';
        maxConfidence = 90;
      } else {
        bestPattern = 'Historic Achievement';
        maxConfidence = 70;
      }
    } else {
      for (const p of patterns) {
        const matches = p.keywords.filter(kw => fullText.includes(kw)).length;
        if (matches > 0) {
          const confidence = Math.min(100, 40 + matches * 15);
          if (confidence > maxConfidence) {
            maxConfidence = confidence;
            bestPattern = p.name;
          }
        }
      }
    }

    const patternObj = patterns.find(p => p.name === bestPattern) || { performance: 80 };

    const result: ViralPatternResult = {
      pattern: bestPattern,
      confidence: maxConfidence,
      historical_performance: patternObj.performance
    };

    if (!context.viralPatterns) {
      context.viralPatterns = {};
    }
    context.viralPatterns[clipId] = result;

    context.executionTimes['ViralPatternEngine'] = (context.executionTimes['ViralPatternEngine'] || 0) + (Date.now() - start);

    return result;
  }
}

export const viralPatternEngine = new ViralPatternEngine();
