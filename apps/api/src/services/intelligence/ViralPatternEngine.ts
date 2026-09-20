import { PipelineContext, ViralPatternResult } from './PipelineContext';
import { callOllamaJson } from '../ollamaService';

export interface WeightedPatternDefinition {
  name: string;
  primaryKeywords: string[];
  synonymRing: string[];
  basePerformance: number;
  distinctivenessWeight: number; // multiplier for rare high-signal terms
}

export class ViralPatternEngine {
  private readonly patterns: WeightedPatternDefinition[] = [
    {
      name: 'Secret Reveal',
      primaryKeywords: ['secret', 'nobody talks', 'hidden', 'reveal', 'whisper', 'truth about', 'the real reason'],
      synonymRing: ['insider', 'confidential', 'exposed', 'what they hide', 'behind closed doors', 'unseen'],
      basePerformance: 88,
      distinctivenessWeight: 1.4
    },
    {
      name: 'Contrarian Opinion',
      primaryKeywords: ['disagree', 'wrong', 'lie', 'actually', 'fake', 'scam', 'nonsense', 'myth', 'stop doing'],
      synonymRing: ['unpopular opinion', 'everyone is wrong', 'waste of time', 'overrated', 'bad advice', 'debunked'],
      basePerformance: 85,
      distinctivenessWeight: 1.3
    },
    {
      name: 'Failure Story',
      primaryKeywords: ['failed', 'lost', 'broke', 'ruined', 'destroyed', 'mistake', 'blew it', 'bankrupt'],
      synonymRing: ['hit rock bottom', 'lost everything', 'huge regret', 'disaster', 'catastrophe', 'downfall'],
      basePerformance: 82,
      distinctivenessWeight: 1.2
    },
    {
      name: 'Transformation Story',
      primaryKeywords: ['before and after', 'before', 'after', 'changed', 'transformed', 'became', 'journey', 'evolved'],
      synonymRing: ['glow up', 'changed my life', 'from zero to', 'started from', 'rebuilt', 'breakthrough', 'new me'],
      basePerformance: 90,
      distinctivenessWeight: 1.35
    },
    {
      name: 'Underdog Win',
      primaryKeywords: ['nobody believed', 'struggling', 'beat all odds', 'victory', 'won against', 'impossible', 'doubted'],
      synonymRing: ['underdog', 'against all odds', 'proved them wrong', 'made history', 'upset', 'miracle'],
      basePerformance: 92,
      distinctivenessWeight: 1.45
    },
    {
      name: 'Massive Mistake',
      primaryKeywords: ['mistake', 'regret', 'should not have', 'warning', 'never do this', 'terrible decision', 'biggest mistake'],
      synonymRing: ['avoid this', 'cost me', 'deadly error', 'costly mistake', 'ruined my', 'do not make this'],
      basePerformance: 87,
      distinctivenessWeight: 1.3
    },
    {
      name: 'Shocking Fact',
      primaryKeywords: ['did you know', 'shocking', 'unbelievable', 'fact', 'surprising', 'statistically', 'insane fact'],
      synonymRing: ['mind blowing', 'crazy thing is', 'you will not believe', 'jaw dropping', 'unreal', 'wildest'],
      basePerformance: 84,
      distinctivenessWeight: 1.25
    },
    {
      name: 'Expert Insight',
      primaryKeywords: ['here is the key', 'framework', 'strategy', 'how to', 'expert', 'tip', 'advice', 'step by step'],
      synonymRing: ['method', 'tactics', 'blueprint', 'mastery', 'formula', 'system', 'technique'],
      basePerformance: 80,
      distinctivenessWeight: 1.1
    },
    {
      name: 'Emotional Confession',
      primaryKeywords: ['i feel', 'honestly', 'scared', 'sad', 'crying', 'hurt', 'confess', 'admit', 'vulnerable'],
      synonymRing: ['broke down', 'never told anyone', 'tears', 'heartbreaking', 'deepest secret', 'painful truth'],
      basePerformance: 86,
      distinctivenessWeight: 1.35
    },
    {
      name: 'Unexpected Twist',
      primaryKeywords: ['suddenly', 'twist', 'expected', 'instead', 'turns out', 'out of nowhere', 'plot twist'],
      synonymRing: ['unforeseen', 'flip', 'without warning', 'shock ending', 'never saw it coming', 'curveball'],
      basePerformance: 89,
      distinctivenessWeight: 1.4
    },
    {
      name: 'Comeback Story',
      primaryKeywords: ['comeback', 'returned', 'recovered', 'rebound', 'again', 'rise', 'resurgence'],
      synonymRing: ['back on top', 'second chance', 'phoenix', 'returned stronger', 'unstopped'],
      basePerformance: 91,
      distinctivenessWeight: 1.35
    },
    {
      name: 'Clutch Sports Moment',
      primaryKeywords: ['clutch', 'last second', 'buzzer', 'winner', 'save', 'miracle', 'game winner', 'stoppage time'],
      synonymRing: ['in the dying seconds', 'heroics', 'nail biter', 'match point', 'sensational goal', 'golden goal'],
      basePerformance: 95,
      distinctivenessWeight: 1.5
    },
    {
      name: 'Historic Achievement',
      primaryKeywords: ['record', 'historic', 'history', 'champion', 'first time', 'legendary', 'world record', 'all time'],
      synonymRing: ['greatest of all time', 'goat', 'unprecedented', 'hall of fame', 'immortalized'],
      basePerformance: 94,
      distinctivenessWeight: 1.4
    }
  ];

  /**
   * Computes vector archetype score using weighted term frequencies + synonym expansion.
   */
  private scoreArchetype(fullText: string, pattern: WeightedPatternDefinition): { score: number; matchCount: number } {
    let rawScore = 0;
    let matchCount = 0;

    for (const kw of pattern.primaryKeywords) {
      if (fullText.includes(kw)) {
        rawScore += 18 * pattern.distinctivenessWeight;
        matchCount++;
      }
    }

    for (const syn of pattern.synonymRing) {
      if (fullText.includes(syn)) {
        rawScore += 12 * pattern.distinctivenessWeight;
        matchCount++;
      }
    }

    return { score: rawScore, matchCount };
  }

  /**
   * Synchronous classification entry point.
   */
  public classify(clipId: string, clipStart: number, clipEnd: number, context: PipelineContext): ViralPatternResult {
    const start = Date.now();
    const clipSegments = (context.transcriptSegments || []).filter(
      (s) => s.start >= clipStart && s.end <= clipEnd
    );

    const fullText = clipSegments.map(s => s.text).join(' ').toLowerCase();
    const category = context.category.category;

    let bestPattern = 'Expert Insight';
    let maxConfidence = 30; // default baseline confidence

    // Special category routing for sports
    if (category === 'football' || category === 'cricket' || category === 'basketball' || category === 'mma' || category === 'esports') {
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
      let highestArchetypeScore = 0;

      for (const p of this.patterns) {
        const { score, matchCount } = this.scoreArchetype(fullText, p);
        if (matchCount > 0) {
          // Confidence scales from 45 up to 98 based on vector score
          const confidence = Math.min(98, Math.round(42 + score));
          if (score > highestArchetypeScore) {
            highestArchetypeScore = score;
            maxConfidence = confidence;
            bestPattern = p.name;
          }
        }
      }
    }

    const patternObj = this.patterns.find(p => p.name === bestPattern) || { basePerformance: 80 };

    const result: ViralPatternResult = {
      pattern: bestPattern,
      confidence: maxConfidence,
      historical_performance: patternObj.basePerformance
    };

    if (!context.viralPatterns) {
      context.viralPatterns = {};
    }
    context.viralPatterns[clipId] = result;

    context.executionTimes['ViralPatternEngine'] = (context.executionTimes['ViralPatternEngine'] || 0) + (Date.now() - start);

    return result;
  }

  /**
   * Async LLM Pattern Judge for high-stakes clips.
   * Prompts Ollama with the 13 archetypes and full transcript context.
   */
  public async classifyWithLLM(
    clipId: string,
    clipStart: number,
    clipEnd: number,
    context: PipelineContext
  ): Promise<ViralPatternResult> {
    const heuristicResult = this.classify(clipId, clipStart, clipEnd, context);
    const clipSegments = (context.transcriptSegments || []).filter(
      (s) => s.start >= clipStart && s.end <= clipEnd
    );
    const text = clipSegments.map(s => s.text).join(' ');

    if (!text || text.length < 30) {
      return heuristicResult;
    }

    const patternNames = this.patterns.map(p => p.name).join(', ');
    const prompt = `You are a viral short-form video strategist. Classify which viral storytelling pattern best fits this transcript.

Transcript: "${text.slice(0, 500)}"

Available patterns: [${patternNames}]

Respond in pure JSON with this exact schema:
{
  "pattern": string (must match one of the available patterns exactly),
  "confidence": number (40 to 100),
  "reasoning": string
}`;

    try {
      const llmOutput = await callOllamaJson<{ pattern: string; confidence: number; reasoning?: string }>({
        systemPrompt: 'You are an AI video virality researcher. Output strict JSON only.',
        userPrompt: prompt,
        fallback: { pattern: heuristicResult.pattern, confidence: heuristicResult.confidence },
        timeoutMs: 8000,
        retries: 1
      });

      const matchedPattern = this.patterns.find(p => p.name.toLowerCase() === (llmOutput.pattern || '').toLowerCase());
      if (matchedPattern) {
        const finalResult: ViralPatternResult = {
          pattern: matchedPattern.name,
          confidence: Math.min(100, Math.max(30, llmOutput.confidence || heuristicResult.confidence)),
          historical_performance: matchedPattern.basePerformance
        };
        if (context.viralPatterns) {
          context.viralPatterns[clipId] = finalResult;
        }
        return finalResult;
      }
    } catch {
      // Return heuristic fallback
    }

    return heuristicResult;
  }
}

export const viralPatternEngine = new ViralPatternEngine();
