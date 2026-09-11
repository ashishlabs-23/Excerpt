import { WordUnit, ClauseUnit, SentenceUnit } from './types';

export class SemanticUnitTokenizer {
  private static readonly PREAMBLE_PATTERNS = [
    ['so', 'basically'],
    ['and', 'so'],
    ['i', 'mean'],
    ['you', 'know'],
    ['to', 'be', 'honest'],
    ['honestly'],
    ['well', 'basically'],
    ['like', 'i', 'said'],
    ['so', 'yeah'],
    ['and', 'then'],
    ['so', 'what', 'happened', 'was'],
    ['basically'],
    ['literally'],
    ['you', 'see'],
    ['i', 'think', 'that'],
    ['right', 'now'],
  ];

  private static readonly CLAUSE_CONJUNCTIONS = new Set([
    'because', 'but', 'although', 'though', 'however', 'whereas',
    'which', 'since', 'whenever', 'wherever', 'unless'
  ]);

  /**
   * Tokenizes raw word-level timestamps and segment information into structured
   * SentenceUnits with nested ClauseUnits.
   */
  public static tokenize(
    rawWords: Array<{ word: string; start: number; end: number; confidence?: number }>,
    segments: Array<{ text: string; start: number; end: number; speaker?: string }> = []
  ): SentenceUnit[] {
    if (!rawWords || rawWords.length === 0) {
      return [];
    }

    // Clean and normalize words
    const words: WordUnit[] = rawWords
      .filter((w) => typeof w.start === 'number' && typeof w.end === 'number' && w.end >= w.start)
      .map((w) => ({
        text: (w.word || '').trim(),
        startSec: Number(w.start.toFixed(3)),
        endSec: Number(w.end.toFixed(3)),
        confidence: w.confidence,
      }))
      .filter((w) => w.text.length > 0);

    if (words.length === 0) {
      return [];
    }

    const sentences: SentenceUnit[] = [];
    let currentSentenceWords: WordUnit[] = [];
    let sentenceIndex = 1;

    for (let i = 0; i < words.length; i++) {
      const currentWord = words[i];
      currentSentenceWords.push(currentWord);

      const nextWord = words[i + 1];
      const isTerminalWord = /[.!?]$/.test(currentWord.text) && !/^(mr|mrs|dr|ms|prof|inc|ltd|e\.g|i\.e)\.$/i.test(currentWord.text);
      const isLargePause = nextWord ? (nextWord.startSec - currentWord.endSec) >= 0.55 : true;
      const isLastWord = i === words.length - 1;

      // Check for speaker change if segments available
      let isSpeakerChange = false;
      if (nextWord && segments.length > 0) {
        const currSeg = segments.find(s => currentWord.startSec >= s.start && currentWord.startSec <= s.end);
        const nextSeg = segments.find(s => nextWord.startSec >= s.start && nextWord.startSec <= s.end);
        if (currSeg?.speaker && nextSeg?.speaker && currSeg.speaker !== nextSeg.speaker) {
          isSpeakerChange = true;
        }
      }

      if (isTerminalWord || isLargePause || isSpeakerChange || isLastWord) {
        const startSec = currentSentenceWords[0].startSec;
        const endSec = currentSentenceWords[currentSentenceWords.length - 1].endSec;
        const sentenceText = currentSentenceWords.map((w) => w.text).join(' ');

        // Associate speaker if present in segments
        const matchedSeg = segments.find((s) => startSec >= s.start - 0.2 && endSec <= s.end + 0.2);
        const speaker = matchedSeg?.speaker;

        const sentenceId = `s_${sentenceIndex}`;
        const clauses = this.extractClauses(sentenceId, currentSentenceWords);

        sentences.push({
          id: sentenceId,
          index: sentenceIndex++,
          text: sentenceText,
          startSec,
          endSec,
          speaker,
          words: [...currentSentenceWords],
          clauses,
          hasTerminalPunctuation: isTerminalWord,
        });

        currentSentenceWords = [];
      }
    }

    return sentences;
  }

  /**
   * Decomposes a sentence into distinct clause units based on punctuation and conjunctions.
   */
  private static extractClauses(sentenceId: string, sentenceWords: WordUnit[]): ClauseUnit[] {
    if (sentenceWords.length === 0) return [];

    const clauses: ClauseUnit[] = [];
    let currentClauseWords: WordUnit[] = [];
    let clauseIndex = 1;

    for (let i = 0; i < sentenceWords.length; i++) {
      const word = sentenceWords[i];
      currentClauseWords.push(word);

      const hasCommaOrBreak = /[,;:\u2014-]$/.test(word.text);
      const cleanWord = word.text.toLowerCase().replace(/[^a-z]/g, '');
      const nextWord = sentenceWords[i + 1];
      const nextClean = nextWord ? nextWord.text.toLowerCase().replace(/[^a-z]/g, '') : '';
      const isConjunctionBoundary = this.CLAUSE_CONJUNCTIONS.has(nextClean);
      const isLastWord = i === sentenceWords.length - 1;

      if (hasCommaOrBreak || isConjunctionBoundary || isLastWord) {
        const startSec = currentClauseWords[0].startSec;
        const endSec = currentClauseWords[currentClauseWords.length - 1].endSec;
        const clauseText = currentClauseWords.map((w) => w.text).join(' ');

        // Check if introductory preamble
        const cleanTokens = currentClauseWords.map((w) => w.text.toLowerCase().replace(/[^a-z]/g, ''));
        const isIntroductoryPreamble = this.PREAMBLE_PATTERNS.some((pattern) => {
          if (pattern.length > cleanTokens.length) return false;
          return pattern.every((tok, idx) => cleanTokens[idx] === tok);
        });

        const lastClean = cleanTokens[cleanTokens.length - 1] || '';
        const endsWithConjunction = this.CLAUSE_CONJUNCTIONS.has(lastClean);

        clauses.push({
          id: `${sentenceId}_c${clauseIndex++}`,
          sentenceId,
          text: clauseText,
          startSec,
          endSec,
          words: [...currentClauseWords],
          isIntroductoryPreamble,
          endsWithConjunction,
        });

        currentClauseWords = [];
      }
    }

    return clauses;
  }
}
