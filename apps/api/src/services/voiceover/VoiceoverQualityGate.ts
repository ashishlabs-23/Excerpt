import { VoiceQualityReport } from '../VoiceQualityEngine';
import { VoiceoverPlan, VoiceoverSegment } from './VoiceoverPlan';

// ─────────────────────────────────────────────────────────────────────────────
// Voiceover Quality Report Types & Thresholds
// ─────────────────────────────────────────────────────────────────────────────

export interface GroundingEvaluation {
  score: number; // 0–100
  passed: boolean;
  evaluated: boolean;
  contradictions: string[];
  unsupportedClaims: string[];
  matchedFacts: string[];
  details: string[];
}

export interface ProsodyEvaluation {
  score: number; // 0–100
  passed: boolean;
  evaluated: boolean;
  loudnessDb: number;
  peakDbFS: number;
  meanDbFS: number;
  estimatedWPM: number;
  issues: string[];
  suggestions: string[];
}

export interface CaptionsEvaluation {
  score: number; // 0–100
  passed: boolean;
  evaluated: boolean;
  eventCount: number;
  avgCPS: number;
  maxCPS: number;
  safeZoneViolations: number;
  timingDriftMs: number;
  issues: string[];
}

export interface TimelineEvaluation {
  score: number; // 0–100
  passed: boolean;
  evaluated: boolean;
  plannedDurationSec: number;
  actualDurationSec: number;
  durationErrorSec: number;
  segmentCount: number;
  droppedSegments: number;
  maxTimestampErrorMs: number;
  issues: string[];
}

export interface AudioMixEvaluation {
  score: number; // 0–100
  passed: boolean;
  evaluated: boolean;
  policyTested: 'duck' | 'mute' | 'keep';
  clippingDetected: boolean;
  duckingEffective: boolean;
  peakDbFS: number;
  meanDbFS: number;
  issues: string[];
}

export interface ResilienceEvaluation {
  score: number; // 0–100
  passed: boolean;
  evaluated: boolean;
  fallbackChainSuccess: boolean;
  cacheIntegrity: boolean;
  retryPrecision: boolean;
  issues: string[];
}

export interface OverallEvaluation {
  score: number; // 0–100 weighted
  decision: 'PASS' | 'FAIL' | 'WARN';
  hardFailure: boolean;
  hardFailureReasons: string[];
}

export interface VoiceoverQualityReport {
  jobId: string;
  clipId: string;
  category?: string;
  provider: string;
  voice: string;
  duration: number;
  grounding: GroundingEvaluation;
  prosody: ProsodyEvaluation;
  captions: CaptionsEvaluation;
  timeline: TimelineEvaluation;
  audio: AudioMixEvaluation;
  resilience: ResilienceEvaluation;
  humanPreference: {
    status: 'PASS' | 'FAIL' | 'NOT_EVALUATED';
    notes: string;
  };
  overall: OverallEvaluation;
  failures: string[];
  warnings: string[];
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial Benchmark Weights (Configurable)
// Grounding: 25%, Prosody: 20%, Captions: 15%, Timeline: 15%, Audio: 15%, Resilience: 10%
// ─────────────────────────────────────────────────────────────────────────────
export const QUALITY_GATE_WEIGHTS = {
  grounding: 0.25,
  prosody: 0.20,
  captions: 0.15,
  timeline: 0.15,
  audio: 0.15,
  resilience: 0.10,
};

export interface BenchmarkGroundTruth {
  facts: string[];
  entities: string[];
  ocrText?: string[];
  forbiddenClaims: string[]; // Explicit visual contradictions if uttered
  expectedSpeakers?: string[];
  dialogueMode?: 'single' | 'duo';
  maxCPS?: number;
  safeZoneMarginPx?: number;
}

export class VoiceoverQualityGate {
  private static instance: VoiceoverQualityGate;

  static getInstance(): VoiceoverQualityGate {
    if (!VoiceoverQualityGate.instance) {
      VoiceoverQualityGate.instance = new VoiceoverQualityGate();
    }
    return VoiceoverQualityGate.instance;
  }

  /**
   * Evaluates factual/visual grounding of narration text against ground truth.
   */
  evaluateGrounding(
    scriptText: string,
    groundTruth?: BenchmarkGroundTruth
  ): GroundingEvaluation {
    if (!groundTruth || (!groundTruth.facts.length && !groundTruth.forbiddenClaims.length)) {
      return {
        score: 100,
        passed: true,
        evaluated: false,
        contradictions: [],
        unsupportedClaims: [],
        matchedFacts: [],
        details: ['Ground truth not provided for this item (NOT_EVALUATED)'],
      };
    }

    const lowerScript = scriptText.toLowerCase();
    const contradictions: string[] = [];
    const unsupportedClaims: string[] = [];
    const matchedFacts: string[] = [];
    const details: string[] = [];

    // Check for explicit visual contradictions
    for (const forbidden of groundTruth.forbiddenClaims) {
      const regex = new RegExp(`\\b${forbidden.toLowerCase()}\\b`, 'i');
      if (regex.test(lowerScript)) {
        contradictions.push(`VISUAL_CONTRADICTION: Script asserted "${forbidden}" which contradicts on-screen evidence.`);
      }
    }

    // Check entity matches
    let matchedEntityCount = 0;
    for (const entity of groundTruth.entities) {
      const regex = new RegExp(`\\b${entity.toLowerCase()}\\b`, 'i');
      if (regex.test(lowerScript)) {
        matchedEntityCount++;
        matchedFacts.push(`Matched entity: ${entity}`);
      }
    }

    // Check fact matches
    for (const fact of groundTruth.facts) {
      const keywords = fact.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const matchedWords = keywords.filter(w => lowerScript.includes(w));
      if (keywords.length > 0 && matchedWords.length / keywords.length >= 0.5) {
        matchedFacts.push(`Matched fact: ${fact}`);
      }
    }

    // Scoring: Each critical contradiction docks 50 points
    let score = 100;
    if (contradictions.length > 0) {
      score = Math.max(0, 100 - contradictions.length * 50);
      details.push(...contradictions);
    } else {
      details.push('Zero critical visual contradictions detected.');
    }

    if (groundTruth.entities.length > 0 && matchedEntityCount === 0 && groundTruth.facts.length > 0) {
      unsupportedClaims.push('UNSUPPORTED_CLAIM: Narration does not ground any primary on-screen entities.');
      score = Math.max(40, score - 20);
    }

    return {
      score,
      passed: contradictions.length === 0 && score >= 75,
      evaluated: true,
      contradictions,
      unsupportedClaims,
      matchedFacts,
      details,
    };
  }

  /**
   * Evaluates ASS subtitles for speed (CPS), line length, and safe zone compliance.
   */
  evaluateCaptions(
    assContent: string,
    groundTruth?: BenchmarkGroundTruth
  ): CaptionsEvaluation {
    if (!assContent || !assContent.includes('Dialogue:')) {
      return {
        score: 0,
        passed: false,
        evaluated: true,
        eventCount: 0,
        avgCPS: 0,
        maxCPS: 0,
        safeZoneViolations: 0,
        timingDriftMs: 0,
        issues: ['CAPTION_MISSING: No dialogue events present in ASS subtitle script.'],
      };
    }

    const dialogueLines = assContent
      .split('\n')
      .filter(line => line.startsWith('Dialogue:'));

    const issues: string[] = [];
    const targetMaxCPS = groundTruth?.maxCPS || 26; // Diagnostic threshold
    const safeMargin = groundTruth?.safeZoneMarginPx || 80;

    // Check style margins in script
    let safeZoneViolations = 0;
    const styleMatch = assContent.match(/Style:\s*Default,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,(\d+),(\d+),(\d+)/i);
    if (styleMatch) {
      const marginL = parseInt(styleMatch[1], 10);
      const marginR = parseInt(styleMatch[2], 10);
      const marginV = parseInt(styleMatch[3], 10);
      if (marginL < safeMargin || marginR < safeMargin) {
        safeZoneViolations++;
        issues.push(`CAPTION_OUTSIDE_SAFE_ZONE: Left/Right margin (${marginL}px/${marginR}px) is tighter than 9:16 safe zone (${safeMargin}px).`);
      }
    }

    const cpsList: number[] = [];
    let previousEndSec = 0;
    let timingDriftMs = 0;

    for (let i = 0; i < dialogueLines.length; i++) {
      const line = dialogueLines[i];
      const parts = line.split(',');
      if (parts.length < 10) continue;

      const startStr = parts[1].trim();
      const endStr = parts[2].trim();
      const text = parts.slice(9).join(',').replace(/\{[^}]+\}/g, '').trim();

      const parseASSTime = (t: string) => {
        const [h, m, s] = t.split(':');
        return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
      };

      const startSec = parseASSTime(startStr);
      const endSec = parseASSTime(endStr);
      const durationSec = Math.max(0.05, endSec - startSec);
      const cleanWord = text.replace(/[^a-zA-Z0-9]/g, '');
      const cps = cleanWord.length / durationSec;
      cpsList.push(cps);

      // Check if captions overlap unnaturally backwards
      if (i > 0 && startSec < previousEndSec - 0.05) {
        issues.push(`CAPTION_OVERLAP: Dialogue event #${i + 1} begins at ${startSec.toFixed(2)}s before previous ended at ${previousEndSec.toFixed(2)}s.`);
      }

      // Check line length (punchy vertical phrasing should not exceed 24 chars per pop)
      if (text.length > 30) {
        issues.push(`CAPTION_OVERFLOW: Dialogue line #${i + 1} exceeds punchy short-form length (${text.length} chars).`);
      }

      previousEndSec = endSec;
    }

    const avgCPS = cpsList.length > 0 ? Number((cpsList.reduce((a, b) => a + b, 0) / cpsList.length).toFixed(1)) : 0;
    const maxCPS = cpsList.length > 0 ? Number(Math.max(...cpsList).toFixed(1)) : 0;

    if (maxCPS > targetMaxCPS) {
      issues.push(`CAPTION_TOO_FAST: Peak characters per second (${maxCPS} CPS) exceeds comfortable reading rate (${targetMaxCPS} CPS).`);
    }

    let score = 100;
    if (safeZoneViolations > 0) score -= 25;
    if (issues.some(i => i.startsWith('CAPTION_OVERLAP'))) score -= 20;
    if (issues.some(i => i.startsWith('CAPTION_TOO_FAST'))) score -= 15;
    if (issues.some(i => i.startsWith('CAPTION_OVERFLOW'))) score -= 10;
    score = Math.max(0, score);

    return {
      score,
      passed: score >= 75 && safeZoneViolations === 0,
      evaluated: true,
      eventCount: dialogueLines.length,
      avgCPS,
      maxCPS,
      safeZoneViolations,
      timingDriftMs,
      issues,
    };
  }

  /**
   * Evaluates timeline consistency: checks for dropped segments, duration errors, and timestamp drift.
   */
  evaluateTimeline(
    plan: VoiceoverPlan,
    actualSegmentAudios: Array<{ id: string; startTime: number; endTime: number; durationMs: number }>,
    finalVideoDuration: number
  ): TimelineEvaluation {
    const plannedDuration = plan.targetDuration;
    const durationError = Math.abs(finalVideoDuration - plannedDuration);
    const issues: string[] = [];

    const plannedSegments = plan.timeline.segments;
    const droppedCount = Math.max(0, plannedSegments.length - actualSegmentAudios.length);

    if (droppedCount > 0) {
      issues.push(`MISSING_NARRATION_SEGMENT: ${droppedCount} planned segment(s) were dropped during synthesis/mixing.`);
    }

    if (durationError > 0.35) {
      issues.push(`FINAL_VIDEO_DURATION_CORRUPTION: Final video duration (${finalVideoDuration.toFixed(2)}s) differs from target duration (${plannedDuration.toFixed(2)}s) by ${durationError.toFixed(2)}s.`);
    }

    let maxTimestampErrorMs = 0;
    for (const planned of plannedSegments) {
      const actual = actualSegmentAudios.find(a => a.id === planned.id);
      if (actual) {
        const offsetErrMs = Math.round(Math.abs(actual.startTime - planned.startTime) * 1000);
        if (offsetErrMs > maxTimestampErrorMs) {
          maxTimestampErrorMs = offsetErrMs;
        }
        if (offsetErrMs > 150) {
          issues.push(`TIMELINE_DRIFT: Segment "${planned.id}" scheduled at ${actual.startTime}s differs from planned ${planned.startTime}s by ${offsetErrMs}ms.`);
        }
      }
    }

    let score = 100;
    if (droppedCount > 0) score -= (droppedCount * 40);
    if (durationError > 0.35) score -= 35;
    if (maxTimestampErrorMs > 150) score -= 20;
    score = Math.max(0, score);

    return {
      score,
      passed: droppedCount === 0 && durationError <= 0.35 && score >= 80,
      evaluated: true,
      plannedDurationSec: plannedDuration,
      actualDurationSec: finalVideoDuration,
      durationErrorSec: Number(durationError.toFixed(2)),
      segmentCount: plannedSegments.length,
      droppedSegments: droppedCount,
      maxTimestampErrorMs,
      issues,
    };
  }

  /**
   * Evaluates duo commentary consistency: alternating speakers, collision prevention, distinct voices.
   */
  evaluateDuoCommentary(segments: VoiceoverSegment[]): {
    score: number;
    passed: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    if (segments.length < 2) {
      return {
        score: 70,
        passed: false,
        issues: ['Duo commentary must feature at least 2 alternating dialogue turns.'],
      };
    }

    let speakerCollisions = 0;
    let duplicateTurns = 0;
    const voicesUsed = new Set<string>();

    for (let i = 0; i < segments.length; i++) {
      const cur = segments[i];
      if (cur.voice) voicesUsed.add(cur.voice);

      if (i > 0) {
        const prev = segments[i - 1];
        // Check timeline collision / overlap
        if (cur.startTime < prev.endTime - 0.05) {
          speakerCollisions++;
          issues.push(`SPEAKER_COLLISION: Turn #${i + 1} (${cur.id}) starts at ${cur.startTime}s before previous turn ended at ${prev.endTime}s.`);
        }

        // Check duplicate text
        if (cur.text.trim().toLowerCase() === prev.text.trim().toLowerCase()) {
          duplicateTurns++;
          issues.push(`DUPLICATE_TURN: Turn #${i + 1} duplicates text from Turn #${i}.`);
        }
      }
    }

    let score = 100;
    if (speakerCollisions > 0) score -= (speakerCollisions * 30);
    if (duplicateTurns > 0) score -= (duplicateTurns * 30);
    if (voicesUsed.size < 2 && segments.length >= 2) {
      issues.push('UNIFORM_VOICE_WARNING: Duo commentary assigned the same voice model to both speaker turns.');
      score -= 15;
    }

    score = Math.max(0, score);
    return {
      score,
      passed: speakerCollisions === 0 && score >= 75,
      issues,
    };
  }

  /**
   * Compiles the full VoiceoverQualityReport across all 6 dimensions.
   */
  compileReport(params: {
    jobId: string;
    clipId: string;
    category?: string;
    provider: string;
    voice: string;
    duration: number;
    grounding: GroundingEvaluation;
    prosody: ProsodyEvaluation;
    captions: CaptionsEvaluation;
    timeline: TimelineEvaluation;
    audio: AudioMixEvaluation;
    resilience: ResilienceEvaluation;
    humanPreferenceNotes?: string;
  }): VoiceoverQualityReport {
    const { grounding, prosody, captions, timeline, audio, resilience } = params;

    // Hard failure detection policy
    const hardFailureReasons: string[] = [];

    if (grounding.contradictions.length > 0) {
      hardFailureReasons.push(`CRITICAL_GROUNDING: ${grounding.contradictions[0]}`);
    }
    if (timeline.droppedSegments > 0) {
      hardFailureReasons.push(`MISSING_SEGMENT: ${timeline.droppedSegments} segment(s) dropped.`);
    }
    if (timeline.durationErrorSec > 0.4) {
      hardFailureReasons.push(`DURATION_CORRUPTION: ${timeline.durationErrorSec}s duration discrepancy.`);
    }
    if (audio.clippingDetected) {
      hardFailureReasons.push('AUDIO_CLIPPING: Peak audio reached 0.0 dBFS (digital clipping).');
    }
    if (captions.safeZoneViolations > 0) {
      hardFailureReasons.push('CAPTIONS_OUTSIDE_SAFE_ZONE: Subtitles violate vertical frame safe margins.');
    }
    if (!resilience.fallbackChainSuccess && resilience.evaluated) {
      hardFailureReasons.push('SILENT_PROVIDER_FAILURE: Fault-injection fallback failed to recover.');
    }

    // Weighted Overall Quality Score
    const weightedScore = Number((
      (grounding.score * QUALITY_GATE_WEIGHTS.grounding) +
      (prosody.score * QUALITY_GATE_WEIGHTS.prosody) +
      (captions.score * QUALITY_GATE_WEIGHTS.captions) +
      (timeline.score * QUALITY_GATE_WEIGHTS.timeline) +
      (audio.score * QUALITY_GATE_WEIGHTS.audio) +
      (resilience.score * QUALITY_GATE_WEIGHTS.resilience)
    ).toFixed(1));

    const isHardFail = hardFailureReasons.length > 0;
    let decision: 'PASS' | 'FAIL' | 'WARN' = 'PASS';

    if (isHardFail || weightedScore < 75) {
      decision = 'FAIL';
    } else if (weightedScore < 80 || prosody.score < 80 || captions.issues.length > 0) {
      decision = 'WARN';
    }

    const failures: string[] = [...hardFailureReasons];
    const warnings: string[] = [
      ...prosody.issues,
      ...captions.issues,
      ...timeline.issues,
      ...audio.issues,
      ...resilience.issues,
    ].filter(w => !failures.includes(w));

    return {
      jobId: params.jobId,
      clipId: params.clipId,
      category: params.category || 'General',
      provider: params.provider,
      voice: params.voice,
      duration: params.duration,
      grounding,
      prosody,
      captions,
      timeline,
      audio,
      resilience,
      humanPreference: {
        status: 'NOT_EVALUATED',
        notes: params.humanPreferenceNotes || 'Human preference panel not engaged for automated run (NOT_EVALUATED).',
      },
      overall: {
        score: weightedScore,
        decision,
        hardFailure: isHardFail,
        hardFailureReasons,
      },
      failures,
      warnings,
      generatedAt: new Date().toISOString(),
    };
  }
}
