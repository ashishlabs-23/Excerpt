import { PipelineContext, CuriosityResult } from './PipelineContext';

interface CuriosityPatternCategory {
  category: 'open_loop' | 'paradox' | 'stakes_urgency' | 'emotional_incongruity';
  weight: number;
  patterns: Array<{
    phrase: string;
    score: number;
    isRegex?: boolean;
    regex?: RegExp;
  }>;
}

export class CuriosityGapEngine {
  private readonly categories: CuriosityPatternCategory[] = [
    {
      category: 'open_loop',
      weight: 1.4,
      patterns: [
        { phrase: 'nobody talks about', score: 26 },
        { phrase: 'i found something weird', score: 28 },
        { phrase: 'the secret to', score: 22 },
        { phrase: 'here is what happened', score: 24 },
        { phrase: 'the real reason why', score: 26 },
        { phrase: 'what they dont tell you', score: 30 },
        { phrase: 'what actually happened', score: 25 },
        { phrase: 'the untold story', score: 27 },
        { phrase: 'you wont believe what', score: 26 },
        { phrase: 'this changes everything', score: 24 },
        { phrase: 'most people dont know', score: 25 },
        { phrase: 'listen to this', score: 18 },
        { phrase: 'watch what happens next', score: 26 },
        { phrase: 'until this happened', score: 24 }
      ]
    },
    {
      category: 'paradox',
      weight: 1.3,
      patterns: [
        { phrase: 'is actually a lie', score: 28 },
        { phrase: 'everyone is wrong about', score: 30 },
        { phrase: 'why you should never', score: 26 },
        { phrase: 'the biggest myth in', score: 27 },
        { phrase: 'stop doing this immediately', score: 29 },
        { phrase: 'it sounds crazy but', score: 24 },
        { phrase: 'the exact opposite of', score: 23 },
        { phrase: 'you are doing it wrong', score: 25 },
        { phrase: 'the counter-intuitive truth', score: 28 }
      ]
    },
    {
      category: 'stakes_urgency',
      weight: 1.35,
      patterns: [
        { phrase: 'this mistake cost me', score: 28 },
        { phrase: 'before it is too late', score: 29 },
        { phrase: 'almost died', score: 32 },
        { phrase: 'lost everything', score: 30 },
        { phrase: 'biggest regret of my life', score: 30 },
        { phrase: 'if you see this run', score: 32 },
        { phrase: 'do not make this mistake', score: 27 },
        { phrase: 'i was banned for', score: 28 },
        { phrase: 'one wrong move', score: 26 },
        { phrase: 'game over if', score: 25 }
      ]
    },
    {
      category: 'emotional_incongruity',
      weight: 1.25,
      patterns: [
        { phrase: 'i broke down in tears', score: 28 },
        { phrase: 'i never told anyone this', score: 30 },
        { phrase: 'i was terrified', score: 26 },
        { phrase: 'i could not stop shaking', score: 28 },
        { phrase: 'the hardest thing i ever', score: 27 },
        { phrase: 'i felt so humiliated', score: 27 },
        { phrase: 'the confession nobody expected', score: 29 }
      ]
    }
  ];

  public analyze(clipId: string, clipStart: number, clipEnd: number, context: PipelineContext): CuriosityResult {
    const start = Date.now();
    const clipSegments = (context.transcriptSegments || []).filter(
      (s) => s.start >= clipStart && s.end <= clipEnd
    );

    if (clipSegments.length === 0) {
      return {
        curiosity_score: 50,
        hook_velocity_index: 45,
        open_loop_strength: 40,
        paradox_score: 30,
        stakes_urgency: 40,
        emotional_incongruity: 35
      };
    }

    const duration = clipEnd - clipStart;
    
    // Windows for psychological evaluation
    const hookWindow = clipSegments.filter(s => s.start < clipStart + 3.0); // 0-3s critical scroll-stop
    const bridgeWindow = clipSegments.filter(s => s.start >= clipStart + 3.0 && s.start < clipStart + 8.0); // 3-8s retention lock
    const bodySegments = clipSegments.filter(s => s.start >= clipStart + 8.0);

    const hookText = hookWindow.map(s => s.text).join(' ').toLowerCase();
    const bridgeText = bridgeWindow.map(s => s.text).join(' ').toLowerCase();
    const bodyText = bodySegments.map(s => s.text).join(' ').toLowerCase();

    // Vector accumulators
    let openLoopAccumulator = 0;
    let paradoxAccumulator = 0;
    let stakesAccumulator = 0;
    let incongruityAccumulator = 0;

    for (const cat of this.categories) {
      for (const p of cat.patterns) {
        let patternScore = 0;
        if (hookText.includes(p.phrase)) {
          patternScore += p.score * 2.5; // Highest impact in hook window
        } else if (bridgeText.includes(p.phrase)) {
          patternScore += p.score * 1.5;
        } else if (bodyText.includes(p.phrase)) {
          patternScore += p.score * 0.7;
        }

        if (patternScore > 0) {
          if (cat.category === 'open_loop') openLoopAccumulator += patternScore * cat.weight;
          if (cat.category === 'paradox') paradoxAccumulator += patternScore * cat.weight;
          if (cat.category === 'stakes_urgency') stakesAccumulator += patternScore * cat.weight;
          if (cat.category === 'emotional_incongruity') incongruityAccumulator += patternScore * cat.weight;
        }
      }
    }

    // Interrogative / Question hook analysis (Direct Cognitive Engagement)
    const questionWords = ['why', 'how', 'what if', 'could it be', 'have you ever', 'who actually', 'where did'];
    const hasHookQuestion = questionWords.some(qw => hookText.includes(qw)) || hookText.includes('?');
    if (hasHookQuestion) {
      openLoopAccumulator += 35;
    }

    // Fast-Paced Speech Density in Hook (Words Per Second in first 3s)
    const hookWords = hookText.trim().split(/\s+/).filter(Boolean);
    const hookWPS = hookWords.length / Math.min(3.0, Math.max(1.0, duration));
    let hookCadenceBonus = 0;
    if (hookWPS >= 2.8 && hookWPS <= 4.2) {
      hookCadenceBonus = 15; // Optimal punchy delivery
    } else if (hookWPS > 4.2) {
      hookCadenceBonus = 8; // Very rapid / intense
    } else if (hookWPS < 1.2 && hookWords.length > 0) {
      hookCadenceBonus = -10; // Slow, draggy start
    }

    // Calculate Hook Velocity Index (HVI)
    const hookRaw = (hookText.length > 0 ? 30 : 10) +
      (hasHookQuestion ? 25 : 0) +
      Math.min(45, (openLoopAccumulator * 0.4) + (stakesAccumulator * 0.3) + (paradoxAccumulator * 0.3)) +
      hookCadenceBonus;
    const hook_velocity_index = Math.min(100, Math.max(10, Math.round(hookRaw)));

    // Normalize category vectors to 0-100 scale
    const open_loop_strength = Math.min(100, Math.max(20, Math.round(40 + openLoopAccumulator * 0.7)));
    const paradox_score = Math.min(100, Math.max(15, Math.round(30 + paradoxAccumulator * 0.8)));
    const stakes_urgency = Math.min(100, Math.max(20, Math.round(35 + stakesAccumulator * 0.75)));
    const emotional_incongruity = Math.min(100, Math.max(15, Math.round(30 + incongruityAccumulator * 0.8)));

    // Unified Master Curiosity Score
    const composite = (hook_velocity_index * 0.40) +
      (open_loop_strength * 0.25) +
      (stakes_urgency * 0.15) +
      (paradox_score * 0.10) +
      (emotional_incongruity * 0.10);

    const curiosity_score = Math.min(100, Math.max(15, Math.round(composite)));

    const result: CuriosityResult = {
      curiosity_score,
      hook_velocity_index,
      open_loop_strength,
      paradox_score,
      stakes_urgency,
      emotional_incongruity
    };

    if (!context.curiosity) {
      context.curiosity = {};
    }
    context.curiosity[clipId] = result;

    context.executionTimes['CuriosityGapEngine'] = (context.executionTimes['CuriosityGapEngine'] || 0) + (Date.now() - start);

    return result;
  }
}

export const curiosityGapEngine = new CuriosityGapEngine();
