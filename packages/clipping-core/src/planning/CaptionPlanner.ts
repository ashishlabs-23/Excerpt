/**
 * CJK-Aware Caption Segmentation Logic (Concrete Implementation)
 * Fixes the previous "disable whitespace splitting" by implementing actual V8 Intl.Segmenter support.
 */

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

export class CaptionPlanner {
  /**
   * Safely chunks a transcript into word-level boundaries, natively supporting 
   * CJK (Chinese, Japanese, Korean) languages where whitespace is not used.
   */
  static segmentTranscript(transcript: string, locale: string): string[] {
    // 1. Fallback for environments lacking Intl.Segmenter (Node < 16.0)
    if (typeof Intl.Segmenter === 'undefined') {
      console.warn('Intl.Segmenter not supported in this environment, falling back to whitespace splitting.');
      return transcript.split(/\s+/).filter(Boolean);
    }

    // 2. Real CJK-Aware Segmentation
    // The segmenter will use dictionaries for zh/ja/ko to find actual word boundaries.
    const segmenter = new Intl.Segmenter(locale, { granularity: 'word' });
    const segments = segmenter.segment(transcript);
    
    const words: string[] = [];
    
    // 3. Iterate over the iterator and filter out raw whitespace tokens
    for (const segment of segments) {
      if (segment.isWordLike) {
        words.push(segment.segment);
      }
    }

    return words;
  }
}
