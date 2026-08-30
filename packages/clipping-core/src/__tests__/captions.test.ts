import { CaptionPlanner } from '../captions/CaptionPlanner';
import { CaptionStyle, CaptionWord } from '../captions/types';
import { LanguageUtils } from '../captions/LanguageUtils';

describe('Kinetic Caption Planning', () => {

  const createWords = (text: string, startMs: number, paceWps: number = 4): CaptionWord[] => {
    const tokens = text.split(' ');
    const msPerWord = 1000 / paceWps;
    return tokens.map((t, i) => ({
      text: t,
      startMs: startMs + (i * msPerWord),
      endMs: startMs + ((i + 1) * msPerWord)
    }));
  };

  it('1. English Baseline', () => {
    const words = createWords('This is a test', 0, 2); // 2 WPS (slow)
    const plan = CaptionPlanner.plan(words, CaptionStyle.HORMOZI);
    
    // Hormozi groups tightly (max 4 WPS). At 2 WPS, it should emit 1 word per card (or line length bound).
    // Actually the guard says: if rawWPS <= max (2 <= 4), it emits immediately. So 1 word per card.
    expect(plan.cards.length).toBe(4);
    expect(plan.cards[0].words[0].text).toBe('This');
    
    // Check safe zone center placement
    expect(plan.cards[0].x).toBe(50); // (100 - 10 - 10)/2 + 10 = 50
  });

  it('2. RTL Language (Arabic) - Reorders correctly', () => {
    // "مرحبا بكم" -> ["مرحبا", "بكم"]
    const words = createWords('مرحبا بكم', 0, 2);
    expect(LanguageUtils.isRTL('مرحبا')).toBe(true);

    const plan = CaptionPlanner.plan(words, CaptionStyle.KINETIC);
    
    // Reordered right to left within the card!
    // Since 2 WPS <= 6 (Kinetic limit), they might be grouped singly unless line rules apply.
    // Let's force them into one card by making speech rate faster than limit.
    const fastWords = createWords('مرحبا بكم', 0, 10); // 10 WPS > 6 WPS limit
    const fastPlan = CaptionPlanner.plan(fastWords, CaptionStyle.KINETIC);

    expect(fastPlan.cards.length).toBe(1); // Grouped into 1 card to save readability
    // RTL ordering means 'بكم' should be first in the array for rendering engines
    expect(fastPlan.cards[0].words[0].text).toBe('بكم');
    expect(fastPlan.cards[0].words[1].text).toBe('مرحبا');
  });

  it('3. CJK Language - Boundary Detection', () => {
    expect(LanguageUtils.isCJK('こんにちは')).toBe(true);
    expect(LanguageUtils.requiresSpaceDelimiter('こんにちは')).toBe(false);
  });

  it('4. Readability Density Guard (High Speech Rate)', () => {
    // User speaking extremely fast (15 words per second)
    const fastWords = createWords('I am speaking incredibly fast because I had way too much coffee today', 0, 15);
    
    // HORMOZI style only allows 4 words per second.
    const plan = CaptionPlanner.plan(fastWords, CaptionStyle.HORMOZI);
    
    // If we didn't group, we'd have 13 cards flashing in 1 second.
    // Due to the guard, it will group them until the block satisfies <= 4 WPS or hits maxLineLength.
    // Max line length for HORMOZI is 3. So it should group in chunks of 3.
    expect(plan.cards.length).toBeLessThan(13);
    expect(plan.cards[0].words.length).toBeGreaterThanOrEqual(1);
    expect(plan.cards[0].words.length).toBeLessThanOrEqual(3);
  });

  it('5. Style Fallback on unsupported script', () => {
    // HORMOZI does not support CJK.
    const words = createWords('こんにちは 世界', 0, 4);
    
    // Spy on console.warn
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    const plan = CaptionPlanner.plan(words, CaptionStyle.HORMOZI);
    
    // Should fallback to MINIMAL
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Falling back to MINIMAL'));
    expect(plan.cards[0].style).toBe(CaptionStyle.MINIMAL);
    
    warnSpy.mockRestore();
  });
});
