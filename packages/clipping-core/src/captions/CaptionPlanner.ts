import { CaptionWord, CaptionCard, CaptionStyle, CaptionStyleConfig, CaptionPlan } from './types';
import { LanguageUtils } from './LanguageUtils';
import { ReadabilityGuard } from './ReadabilityGuard';

const CONFIGS: Record<CaptionStyle, CaptionStyleConfig> = {
  [CaptionStyle.HORMOZI]: {
    name: CaptionStyle.HORMOZI,
    supportedScripts: ['LATIN'], // Relies heavily on Latin fonts
    maxWordsPerSecond: 4, // 1-2 words per card
    maxLineLength: 3,
    safeZone: { topPercent: 10, bottomPercent: 30, leftPercent: 10, rightPercent: 10 },
    features: { activeWordHighlighting: true, speakerColors: true, emphasis: true, emoji: true }
  },
  [CaptionStyle.KINETIC]: {
    name: CaptionStyle.KINETIC,
    supportedScripts: ['LATIN', 'RTL', 'CJK'],
    maxWordsPerSecond: 6,
    maxLineLength: 5,
    safeZone: { topPercent: 20, bottomPercent: 40, leftPercent: 15, rightPercent: 15 },
    features: { activeWordHighlighting: true, speakerColors: false, emphasis: true, emoji: false }
  },
  [CaptionStyle.MINIMAL]: {
    name: CaptionStyle.MINIMAL,
    supportedScripts: ['LATIN', 'RTL', 'CJK'],
    maxWordsPerSecond: 10, // Full sentences
    maxLineLength: 15,
    safeZone: { topPercent: 80, bottomPercent: 95, leftPercent: 5, rightPercent: 5 },
    features: { activeWordHighlighting: false, speakerColors: false, emphasis: false, emoji: false }
  },
  [CaptionStyle.CLEAN]: {
    name: CaptionStyle.CLEAN,
    supportedScripts: ['LATIN', 'RTL'],
    maxWordsPerSecond: 8,
    maxLineLength: 10,
    safeZone: { topPercent: 70, bottomPercent: 90, leftPercent: 5, rightPercent: 5 },
    features: { activeWordHighlighting: true, speakerColors: true, emphasis: false, emoji: false }
  },
  [CaptionStyle.RAW]: {
    name: CaptionStyle.RAW,
    supportedScripts: ['LATIN', 'RTL', 'CJK'],
    maxWordsPerSecond: 15,
    maxLineLength: 20,
    safeZone: { topPercent: 50, bottomPercent: 90, leftPercent: 0, rightPercent: 0 },
    features: { activeWordHighlighting: false, speakerColors: false, emphasis: false, emoji: false }
  }
};

export class CaptionPlanner {

  static plan(words: CaptionWord[], style: CaptionStyle): CaptionPlan {
    if (words.length === 0) {
      return { schemaVersion: '1.0.0', cards: [] };
    }

    // 1. Language Detection & Style Fallback
    const combinedText = words.map(w => w.text).join(' ');
    const isRTL = LanguageUtils.isRTL(combinedText);
    const isCJK = LanguageUtils.isCJK(combinedText);
    const script = isRTL ? 'RTL' : (isCJK ? 'CJK' : 'LATIN');

    let targetConfig = CONFIGS[style];
    if (!targetConfig.supportedScripts.includes(script)) {
      console.warn(`[CaptionPlanner] Style ${style} does not support script ${script}. Falling back to MINIMAL.`);
      targetConfig = CONFIGS[CaptionStyle.MINIMAL];
    }

    // 2. Readability Guard (Grouping)
    const groupedWords = ReadabilityGuard.applyReadabilityDensity(words, targetConfig);

    // 3. Plan Cards
    const cards: CaptionCard[] = [];
    
    for (let group of groupedWords) {
      if (group.length === 0) continue;

      // Apply RTL word ordering if needed
      if (isRTL) {
        group = LanguageUtils.applyRTLOrdering(group);
      }

      const startMs = Math.min(...group.map(w => w.startMs));
      const endMs = Math.max(...group.map(w => w.endMs));

      // Calculate center of safe zone mathematically
      const sz = targetConfig.safeZone;
      const x = sz.leftPercent + ((100 - sz.leftPercent - sz.rightPercent) / 2);
      const y = sz.topPercent + ((100 - sz.topPercent - sz.bottomPercent) / 2);

      cards.push({
        words: group,
        startMs,
        endMs,
        x,
        y,
        style: targetConfig.name
      });
    }

    return {
      schemaVersion: '1.0.0',
      cards
    };
  }
}
