export class LanguageUtils {
  
  /**
   * Detects if the text contains Arabic or Hebrew Unicode ranges.
   */
  static isRTL(text: string): boolean {
    const rtlRegex = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
    return rtlRegex.test(text);
  }

  /**
   * Detects if the text contains Chinese, Japanese, or Korean Unicode ranges.
   */
  static isCJK(text: string): boolean {
    const cjkRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
    return cjkRegex.test(text);
  }

  /**
   * Re-orders words for RTL rendering engines.
   * By reversing the array, the first spoken word is placed on the far right.
   */
  static applyRTLOrdering<T>(words: T[]): T[] {
    return [...words].reverse();
  }

  /**
   * Standardizes word tokens based on language rules.
   * If CJK, we don't rely on whitespace for tokenization in the visual grouping.
   * Note: Whisper usually emits tokens that we just consume, but this tells the planner
   * not to enforce trailing spaces.
   */
  static requiresSpaceDelimiter(text: string): boolean {
    return !this.isCJK(text);
  }
}
