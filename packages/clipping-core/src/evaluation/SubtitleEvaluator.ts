import { IEvaluator, EvaluatorResult } from './IEvaluator';

export interface SubtitleRuleConfig {
  maxCharsPerLine: number;
  maxCPS: number;
  maxWordsPerSubtitle: number;
  minDurationSec: number;
  maxDurationSec: number;
  safeAreaCenterYMax: number;
}

const DEFAULT_SUBTITLE_RULES: SubtitleRuleConfig = {
  maxCharsPerLine: 25,
  maxCPS: 20,
  maxWordsPerSubtitle: 6,
  minDurationSec: 0.5,
  maxDurationSec: 5.0,
  safeAreaCenterYMax: 800
};

export class SubtitleEvaluator implements IEvaluator {
  public evaluate(expectedASS: string | null, generatedASS: string): EvaluatorResult {
    let score = 100;
    let passed = true;
    const regressions: string[] = [];
    const notes: string[] = [];
    const rules = DEFAULT_SUBTITLE_RULES;

    if (!generatedASS) {
      return {
        component: 'SubtitleEvaluator',
        score: 0,
        passed: false,
        regressions: ['No ASS content generated.'],
        notes: ['Fatal error: missing subtitle output.']
      };
    }

    const lines = generatedASS.split('\n').filter(l => l.startsWith('Dialogue:'));
    let previousEndSec = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(',');
      if (parts.length < 10) continue;

      const startStr = parts[1];
      const endStr = parts[2];
      const textRaw = parts.slice(9).join(',');
      
      const startSec = this.parseAssTime(startStr);
      const endSec = this.parseAssTime(endStr);
      const duration = endSec - startSec;
      
      const cleanText = textRaw.replace(/\{[^}]+\}/g, '').trim();
      const words = cleanText.split(/\s+/).filter(w => w.length > 0);
      const charCount = cleanText.length;

      if (startSec < previousEndSec - 0.05) {
        score -= 5;
        notes.push(`Overlapping dialogue detected at ${startStr}.`);
      }
      previousEndSec = Math.max(previousEndSec, endSec);

      if (charCount > rules.maxCharsPerLine) {
        score -= 2;
        notes.push(`Line overflow at ${startStr}: ${charCount} chars > ${rules.maxCharsPerLine}.`);
      }

      const cps = duration > 0 ? charCount / duration : 0;
      if (cps > rules.maxCPS) {
        score -= 5;
        notes.push(`High CPS at ${startStr}: ${cps.toFixed(1)} > ${rules.maxCPS}.`);
      }

      if (words.length > rules.maxWordsPerSubtitle) {
        score -= 2;
        notes.push(`Too many words at ${startStr}: ${words.length} > ${rules.maxWordsPerSubtitle}.`);
      }

      if (duration < rules.minDurationSec && words.length > 0) {
        score -= 2;
        notes.push(`Subtitle too short at ${startStr}: ${duration.toFixed(2)}s < ${rules.minDurationSec}s.`);
      }
      if (duration > rules.maxDurationSec) {
        score -= 2;
        notes.push(`Subtitle too long at ${startStr}: ${duration.toFixed(2)}s > ${rules.maxDurationSec}s.`);
      }

      if (words.length === 1 && duration > 1.0) {
        score -= 1;
        notes.push(`Orphan word detected at ${startStr}: "${cleanText}".`);
      }
    }

    if (score < 90) {
      passed = false;
      regressions.push(`Subtitle QA score dropped to ${score} (Threshold: 90)`);
    }

    return {
      component: 'SubtitleEvaluator',
      score: Math.max(0, score),
      passed,
      regressions,
      notes
    };
  }

  private parseAssTime(timeStr: string): number {
    const parts = timeStr.split(':');
    if (parts.length !== 3) return 0;
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    return (h * 3600) + (m * 60) + s;
  }
}
