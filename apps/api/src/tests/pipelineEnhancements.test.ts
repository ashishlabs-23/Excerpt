import { ContextCoherenceGuard } from '../services/intelligence/ContextCoherenceGuard';
import { SceneCutSnapper, SceneCutPoint } from '../services/intelligence/SceneCutSnapper';
import { MultiScaleStoryEngine } from '../services/intelligence/MultiScaleStoryEngine';
import { MicroJumpCutter } from '../services/intelligence/MicroJumpCutter';

describe('SOTA Clipping Pipeline Enhancements', () => {
  describe('ContextCoherenceGuard', () => {
    const guard = new ContextCoherenceGuard();

    it('scrubs Whisper repetition hallucination loops', () => {
      const words = [
        { word: 'Hello', start: 1.0, end: 1.5 },
        { word: 'world', start: 1.6, end: 2.0 },
        { word: 'thanks', start: 2.1, end: 2.4 },
        { word: 'thanks', start: 2.5, end: 2.8 },
        { word: 'thanks', start: 2.9, end: 3.2 },
        { word: 'thanks', start: 3.3, end: 3.6 },
        { word: 'thanks', start: 3.7, end: 4.0 },
      ];

      const scrubbed = guard.scrubHallucinations(words);
      // Repeating > 3 times should be clamped to 3
      expect(scrubbed.length).toBe(5);
      expect(scrubbed.filter(w => w.word === 'thanks').length).toBe(3);
    });

    it('expands start backward when candidate starts on a dangling pronoun', () => {
      const words = [
        { word: 'Steve', start: 10.0, end: 10.4 },
        { word: 'Jobs', start: 10.5, end: 10.8 },
        { word: 'said', start: 10.9, end: 11.2 },
        { word: 'he', start: 11.5, end: 11.7 },
        { word: 'wanted', start: 11.8, end: 12.1 },
        { word: 'to', start: 12.2, end: 12.3 },
        { word: 'build', start: 12.4, end: 12.7 },
      ];

      // Candidate starts right at 'he' (11.5s)
      const res = guard.guardBoundaries(words, 11.5, 12.7);
      expect(res.danglingPronounResolved).toBe(true);
      // Start should expand back to include 'Steve'
      expect(res.startSec).toBeLessThanOrEqual(10.0);
    });

    it('resolves trailing conjunction cliffhangers at the end of a candidate', () => {
      const words = [
        { word: 'We', start: 5.0, end: 5.2 },
        { word: 'won', start: 5.3, end: 5.6 },
        { word: 'because', start: 5.7, end: 6.1 },
        { word: 'we', start: 6.2, end: 6.4 },
        { word: 'trained', start: 6.5, end: 6.9 },
      ];

      // Candidate ends at 'because' (6.1s)
      const res = guard.guardBoundaries(words, 5.0, 6.1);
      expect(res.cliffhangerResolved).toBe(true);
      // Should expand forward to finish the thought
      expect(res.endSec).toBeGreaterThan(6.1);
    });
    it('strips conversational preambles so clip starts immediately on the punchy hook', () => {
      const words = [
        { word: 'So', start: 1.0, end: 1.2 },
        { word: 'basically', start: 1.3, end: 1.7 },
        { word: 'we', start: 1.8, end: 2.0 },
        { word: 'lost', start: 2.1, end: 2.4 },
        { word: 'two', start: 2.5, end: 2.7 },
        { word: 'million', start: 2.8, end: 3.2 },
        { word: 'dollars', start: 3.3, end: 3.8 },
        { word: 'in', start: 3.9, end: 4.1 },
        { word: 'one', start: 4.2, end: 4.4 },
        { word: 'day', start: 4.5, end: 4.8 },
        { word: 'and', start: 4.9, end: 5.1 },
        { word: 'nobody', start: 5.2, end: 5.6 },
        { word: 'knew', start: 5.7, end: 6.0 },
        { word: 'what', start: 6.1, end: 6.3 },
        { word: 'happened', start: 6.4, end: 6.9 },
        { word: 'next', start: 7.0, end: 7.4 },
        { word: 'at', start: 7.5, end: 7.7 },
        { word: 'all', start: 7.8, end: 8.2 },
        { word: 'here', start: 8.3, end: 8.6 },
        { word: 'today', start: 8.7, end: 9.1 },
        { word: 'now', start: 9.2, end: 9.5 },
        { word: 'then', start: 9.6, end: 10.0 },
        { word: 'forever', start: 10.1, end: 10.6 },
        { word: 'end', start: 10.7, end: 11.2 },
        { word: 'story', start: 11.3, end: 11.8 },
      ];

      // Candidate starts at 1.0s ('So basically...')
      const res = guard.guardBoundaries(words, 1.0, 11.8);
      expect(res.preambleStripped).toBe(true);
      // Start should advance past 'basically' directly to 'we' (1.8s)
      expect(res.startSec).toBeGreaterThanOrEqual(1.8);
    });
  });

  describe('SceneCutSnapper', () => {
    const snapper = new SceneCutSnapper();

    it('snaps speech boundaries to visual cuts without truncating spoken words', () => {
      const words = [
        { word: 'Welcome', start: 10.2, end: 10.7 },
        { word: 'everyone', start: 10.8, end: 11.4 },
        { word: 'goodbye', start: 19.0, end: 19.5 },
      ];

      const sceneCuts: SceneCutPoint[] = [
        { timestampSec: 10.0, score: 0.9 }, // 0.2s before speech
        { timestampSec: 19.8, score: 0.9 }, // 0.3s after speech
      ];

      // Start: 10.15s, End: 19.6s
      const snapped = snapper.snapBoundariesToSceneCut(10.15, 19.6, sceneCuts, 0.45, { words });
      expect(snapped.startSnapped).toBe(true);
      expect(snapped.snappedStartSec).toBe(10.0); // Cut happens before speech, snapped cleanly
      expect(snapped.endSnapped).toBe(true);
      expect(snapped.snappedEndSec).toBe(19.8); // Cut happens after speech, snapped cleanly
    });

    it('refuses to snap startSec past the first spoken word to guarantee zero speech truncation', () => {
      const words = [
        { word: 'Welcome', start: 10.2, end: 10.7 },
      ];

      const sceneCuts: SceneCutPoint[] = [
        { timestampSec: 10.4, score: 0.9 }, // Cut is inside the spoken word!
      ];

      const snapped = snapper.snapBoundariesToSceneCut(10.2, 19.6, sceneCuts, 0.45, { words });
      // Snapper must refuse to advance past 10.2 to avoid truncating speech
      expect(snapped.snappedStartSec).toBeLessThanOrEqual(10.2);
    });
  });

  describe('MultiScaleStoryEngine', () => {
    const storyEngine = new MultiScaleStoryEngine();

    it('evaluates multi-scale candidate arcs across 30s, 60s, and 90s tiers', () => {
      const words = [
        { word: 'Hook', start: 0.5, end: 1.0 },
        { word: 'Story', start: 15.0, end: 16.0 },
        { word: 'Middle', start: 28.0, end: 29.0 },
        { word: 'Climax', start: 45.0, end: 46.0 },
        { word: 'Resolution', start: 58.0, end: 59.0 },
        { word: 'Insight', start: 85.0, end: 86.0 },
      ];

      const candidates = storyEngine.evaluateMultiScaleArcs(words, 90.0);
      expect(candidates.length).toBe(3);

      const hookArc = candidates.find(c => c.scaleType === '30s_hook');
      const storyArc = candidates.find(c => c.scaleType === '60s_story');
      const insightArc = candidates.find(c => c.scaleType === '90s_insight');

      expect(hookArc).toBeDefined();
      expect(storyArc).toBeDefined();
      expect(insightArc).toBeDefined();

      expect(hookArc?.recommendedPlatform).toBe('TikTok / Shorts');
      expect(storyArc?.recommendedPlatform).toBe('IG Reels / YouTube');
      expect(insightArc?.recommendedPlatform).toBe('LinkedIn / Long Shorts');
    });
  });

  describe('MicroJumpCutter', () => {
    const cutter = new MicroJumpCutter(0.55, 0.25);

    it('identifies dead-air gaps (>0.55s) and creates retimed word timestamps', () => {
      const words = [
        { word: 'First', start: 1.0, end: 1.4 },
        { word: 'phrase', start: 1.5, end: 1.8 },
        // 1.5s dead air gap (>0.55s)
        { word: 'Second', start: 3.3, end: 3.7 },
        { word: 'phrase', start: 3.8, end: 4.1 },
      ];

      const plan = cutter.planJumpCuts(words, 1.0, 5.0);

      expect(plan.edlSegments.length).toBe(2);
      expect(plan.timeSavedSec).toBeGreaterThan(0.8);
      expect(plan.totalNewDurationSec).toBeLessThan(plan.totalOriginalDurationSec);

      // Verify words are retimed continuously
      expect(plan.retimedWords.length).toBe(4);
      const firstPhraseEnd = plan.retimedWords[1].end;
      const secondPhraseStart = plan.retimedWords[2].start;
      expect(secondPhraseStart - firstPhraseEnd).toBeLessThan(0.4);
    });
  });

  describe('EditorialPlanEvaluator (Phase A: Hook & Narrative Intelligence)', () => {
    const { EditorialPlanEvaluator } = require('../services/intelligence/EditorialPlanEvaluator');
    const evaluator = new EditorialPlanEvaluator();

    it('generates hook_adjusted variant to strip throat-clearing preamble and sharpen hook', () => {
      const words = [
        { word: 'So', start: 0.0, end: 0.3 },
        { word: 'basically', start: 0.4, end: 0.9 },
        { word: 'we', start: 1.2, end: 1.4 },
        { word: 'lost', start: 1.5, end: 1.8 },
        { word: 'two', start: 1.9, end: 2.1 },
        { word: 'million', start: 2.2, end: 2.6 },
        { word: 'dollars', start: 2.7, end: 3.2 },
        { word: 'in', start: 3.3, end: 3.5 },
        { word: 'one', start: 3.6, end: 3.8 },
        { word: 'day.', start: 3.9, end: 4.3 },
        { word: 'And', start: 4.5, end: 4.7 },
        { word: 'the', start: 4.8, end: 5.0 },
        { word: 'result', start: 5.1, end: 5.5 },
        { word: 'is', start: 5.6, end: 5.8 },
        { word: 'bankruptcy.', start: 5.9, end: 6.5 },
      ];

      const plan = evaluator.evaluateCandidate('clip-1', 0.0, 15.0, words);
      expect(plan.accepted).toBe(true);
      expect(plan.winningVariant.variantId).toBe('hook_adjusted');
      expect(plan.winningVariant.startSec).toBe(1.2);
      expect(plan.winningVariant.hookScore).toBeGreaterThanOrEqual(85);
    });

    it('generates payoff_extended variant when ending terminates abruptly on an incomplete thought', () => {
      const words = [
        { word: 'Why', start: 0.0, end: 0.3 },
        { word: 'did', start: 0.4, end: 0.6 },
        { word: 'the', start: 0.7, end: 0.9 },
        { word: 'deal', start: 1.0, end: 1.3 },
        { word: 'collapse?', start: 1.4, end: 2.0 },
        { word: 'Because', start: 2.5, end: 2.8 },
        // Candidate ends prematurely at 3.0s, but resolution is at 4.5s
        { word: 'nobody', start: 3.2, end: 3.6 },
        { word: 'signed', start: 3.7, end: 4.0 },
        { word: 'it.', start: 4.1, end: 4.5 },
      ];

      const plan = evaluator.evaluateCandidate('clip-2', 0.0, 3.0, words);
      expect(plan.accepted).toBe(true);
      expect(plan.winningVariant.variantId).toBe('payoff_extended');
      expect(plan.winningVariant.endSec).toBeGreaterThanOrEqual(4.5);
    });

    it('only generates raw variant when opening is already punchy and ending is complete', () => {
      const words = [
        { word: 'Never', start: 0.0, end: 0.4 },
        { word: 'hire', start: 0.5, end: 0.8 },
        { word: 'fast', start: 0.9, end: 1.2 },
        { word: 'and', start: 1.3, end: 1.5 },
        { word: 'fire', start: 1.6, end: 1.9 },
        { word: 'slow.', start: 2.0, end: 2.5 },
        { word: 'The', start: 2.8, end: 3.0 },
        { word: 'lesson', start: 3.1, end: 3.5 },
        { word: 'is', start: 3.6, end: 3.8 },
        { word: 'character.', start: 3.9, end: 4.5 },
      ];

      const plan = evaluator.evaluateCandidate('clip-3', 0.0, 15.0, words);
      expect(plan.accepted).toBe(true);
      expect(plan.allVariants.length).toBe(1);
      expect(plan.winningVariant.variantId).toBe('raw');
    });

    it('strictly rejects candidate when narrative payoff is materially violated (strong hook + no payoff)', () => {
      const words = [
        { word: 'The', start: 0.0, end: 0.2 },
        { word: 'biggest', start: 0.3, end: 0.7 },
        { word: 'secret', start: 0.8, end: 1.2 },
        { word: 'nobody', start: 1.3, end: 1.6 },
        { word: 'tells', start: 1.7, end: 1.9 },
        { word: 'you', start: 2.0, end: 2.2 },
        { word: 'is', start: 2.3, end: 2.5 },
        { word: 'that', start: 2.6, end: 2.9 }, // Cuts off on dangling conjunction with no future words!
      ];

      const plan = evaluator.evaluateCandidate('clip-4', 0.0, 3.0, words);
      // Must not allow high hook score to rescue broken payoff
      expect(plan.accepted).toBe(false);
      expect(plan.rejectionReason).toContain('that');
    });
  });
});
