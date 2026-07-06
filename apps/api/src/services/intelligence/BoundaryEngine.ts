import fs from 'fs';
import path from 'path';
import { TranscriptionResult } from "../transcriptionService";

export interface PaddingConfig {
  lead: number;
  tail: number;
}

export interface BoundaryConfig {
  defaultPadding: PaddingConfig;
  intents: Record<string, PaddingConfig>;
  ensureCompleteSentences: boolean;
  minDurationSec: number;
  maxDurationSec: number;
}

const DEFAULT_CONFIG: BoundaryConfig = {
  defaultPadding: { lead: 0.5, tail: 0.5 },
  intents: {
    question: { lead: 1.0, tail: 0.6 },
    punchline: { lead: 0.4, tail: 1.5 },
    tutorial: { lead: 1.2, tail: 0.8 },
    reaction: { lead: 0.2, tail: 0.2 },
  },
  ensureCompleteSentences: true,
  minDurationSec: 15,
  maxDurationSec: 60
};

export class BoundaryEngine {
  /**
   * Refines a rough clip boundary using word-level timestamps.
   * Ensures no mid-word cuts and pads with natural breathing room.
   */
  public snapBoundaries(
    roughStart: number, 
    roughEnd: number, 
    transcription: TranscriptionResult,
    intent: string = 'default',
    config: Partial<BoundaryConfig> = {}
  ): { start_time: number; end_time: number } {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const padding = finalConfig.intents[intent.toLowerCase()] || finalConfig.defaultPadding;
    
    // Load external heuristic rules
    const rulesPath = path.join(process.cwd(), 'prompts', 'boundary_rules.json');
    let boundaryRules: any = { invalid_prefixes: [], incomplete_suffixes: [] };
    if (fs.existsSync(rulesPath)) {
      boundaryRules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
    }
    
    // If we don't have word-level timestamps, just apply basic padding.
    if (!transcription.words || transcription.words.length === 0) {
      console.warn('[BoundaryEngine] No word-level timestamps available. Falling back to basic padding.');
      return this.applyDurationConstraints(
        Math.max(0, roughStart - padding.lead),
        roughEnd + padding.tail,
        finalConfig
      );
    }

    // 1. Find the word that corresponds to the rough start
    const startWordIdx = transcription.words.findIndex(w => w.end > roughStart);
    let exactStart = roughStart;
    
    if (startWordIdx !== -1) {
      const startWord = transcription.words[startWordIdx];
      // Snap to the exact beginning of the spoken word, minus lead-in padding
      exactStart = Math.max(0, startWord.start - padding.lead);
      
      // Semantic snapping (optional: push back to start of sentence if mid-sentence)
      if (finalConfig.ensureCompleteSentences && startWordIdx > 0) {
        let sentenceStartFound = false;
        for (let i = startWordIdx - 1; i >= Math.max(0, startWordIdx - 10); i--) {
          const prevWord = transcription.words[i];
          if (/[.?!]$/.test(prevWord.word)) {
            const newStartWord = transcription.words[i + 1];
            if (newStartWord && newStartWord.start < exactStart + 5) {
              exactStart = Math.max(0, newStartWord.start - padding.lead);
              sentenceStartFound = true;
            }
            break;
          }
        }
        
        // Check invalid prefixes
        const currentWordStr = startWord.word.replace(/[^a-zA-Z]/g, '').toLowerCase();
        if (boundaryRules.invalid_prefixes.includes(currentWordStr)) {
          // Push start boundary forward to skip the prefix
          if (startWordIdx + 1 < transcription.words.length) {
            exactStart = Math.max(0, transcription.words[startWordIdx + 1].start - padding.lead);
          }
        }
      }
    }

    // 2. Find the word that corresponds to the rough end
    const endWordIdx = transcription.words.findIndex(w => w.start >= roughEnd);
    let exactEnd = roughEnd;

    if (endWordIdx !== -1) {
      // The word AT endWordIdx is past our roughEnd, so we want the word BEFORE it.
      const endWord = endWordIdx > 0 ? transcription.words[endWordIdx - 1] : transcription.words[0];
      
      // Snap to the exact end of the spoken word, plus outro padding
      exactEnd = endWord.end + padding.tail;
      
      // Semantic snapping: Push forward to end of sentence if mid-sentence
      if (finalConfig.ensureCompleteSentences) {
        let currentSuffix = endWord.word;
        if (endWordIdx > 1) {
           currentSuffix = `${transcription.words[endWordIdx-2].word} ${transcription.words[endWordIdx-1].word}`.toLowerCase().replace(/[^a-z ]/g, '');
        }

        // Check if suffix matches incomplete_suffixes and needs extension
        const needsExtension = boundaryRules.incomplete_suffixes.some((suffix: string) => currentSuffix.includes(suffix));
        
        let searchLimit = needsExtension ? 30 : 15; // Search further if we know it's incomplete

        for (let i = endWordIdx - 1; i < Math.min(transcription.words.length, endWordIdx + searchLimit); i++) {
          const w = transcription.words[i];
          if (/[.?!]$/.test(w.word)) {
            if (w.end > exactEnd && w.end < exactEnd + (needsExtension ? 10 : 5)) {
              exactEnd = w.end + padding.tail;
            }
            break;
          }
        }
      }
    } else if (transcription.words.length > 0) {
      // roughEnd is past the last word
      exactEnd = transcription.words[transcription.words.length - 1].end + padding.tail;
    }

    return this.applyDurationConstraints(exactStart, exactEnd, finalConfig);
  }

  private applyDurationConstraints(start: number, end: number, config: BoundaryConfig) {
    let finalStart = start;
    let finalEnd = end;
    let duration = finalEnd - finalStart;

    if (duration > config.maxDurationSec) {
      // Trim from the end if too long
      finalEnd = finalStart + config.maxDurationSec;
    } else if (duration < config.minDurationSec) {
      // Pad equally on both sides if too short, bounded by 0
      const deficit = config.minDurationSec - duration;
      finalStart = Math.max(0, finalStart - (deficit / 2));
      finalEnd = finalEnd + (deficit / 2);
    }

    return {
      start_time: Number(finalStart.toFixed(2)),
      end_time: Number(finalEnd.toFixed(2))
    };
  }
}
