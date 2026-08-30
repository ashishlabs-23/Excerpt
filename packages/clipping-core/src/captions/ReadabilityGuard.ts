import { CaptionWord, CaptionStyleConfig } from './types';

export class ReadabilityGuard {
  
  /**
   * Enforces the maximum words-per-second threshold.
   * If a group of words flashes too fast for a given style, they are grouped into a larger block.
   */
  static applyReadabilityDensity(
    words: CaptionWord[],
    config: CaptionStyleConfig
  ): CaptionWord[][] {
    const outputGroups: CaptionWord[][] = [];
    let currentGroup: CaptionWord[] = [];
    let groupStartMs = -1;

    for (const word of words) {
      if (groupStartMs === -1) {
        groupStartMs = word.startMs;
      }
      currentGroup.push(word);

      const rawWPS = (currentGroup.length / ((word.endMs - groupStartMs) / 1000)) || 0;
      
      if (rawWPS <= config.maxWordsPerSecond || currentGroup.length >= config.maxLineLength) {
        // Safe to emit this group, or we hit line length limits
        outputGroups.push([...currentGroup]);
        currentGroup = [];
        groupStartMs = -1;
      }
    }

    if (currentGroup.length > 0) {
      outputGroups.push(currentGroup);
    }

    return outputGroups;
  }
}
