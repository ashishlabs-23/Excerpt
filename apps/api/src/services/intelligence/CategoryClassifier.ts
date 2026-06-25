/**
 * CategoryClassifier — Stage 1.5
 *
 * Automatically classifies video content type from:
 *   1. Transcript keyword signals (zero-latency, pure regex)
 *   2. Audio energy variance (from existing FFmpeg volumedetect data)
 *   3. Optional frame-color sampling (grass green → sports field heuristic)
 *
 * If confidence < 0.70, defaults to 'podcast' so the existing transcript
 * pipeline runs unchanged — zero regression for current use cases.
 *
 * Gated by: EXCERPT_MULTIMODAL_ENABLED=true AND EXCERPT_CLASSIFIER_ENABLED != false
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { getBinaryPath } from '../videoProcessor';
import {
  CategoryResult,
  ContentCategory,
} from './PipelineContext';

const execFileAsync = promisify(execFile);

// ─── Keyword signal maps ────────────────────────────────────────────────────
//
// Each category has THREE tier of patterns:
//   HIGH (weight 3.0) — highly exclusive terms almost impossible in other categories
//   MED  (weight 1.5) — moderately specific terms
//   LOW  (weight 1.0) — generic terms that may appear across categories
//
// Scoring is raw weighted hits, not normalized fractions.
// This prevents common words like "host/guest" from drowning out "goal/striker".

interface PatternGroup {
  patterns: RegExp[];
  weight: number;
}

const KEYWORD_SIGNALS: Record<ContentCategory, PatternGroup[]> = {
  football: [
    {
      weight: 3.0,
      patterns: [
        /\b(offside|var|goalkeeper|keeper|striker|dribbl|crossbar|penalty area|free kick|yellow card|red card|hat.trick|corner kick|injury time|added time|halftime whistle|handball|clearance|header)\b/gi,
      ],
    },
    {
      weight: 1.5,
      patterns: [
        /\b(goal|goals|penalty|penalties|referee|pitch|stadium|foul|tackle|substitut|defender|midfielder|winger|forward|match|kick|shoot|shot|save|ball|boots|kit)\b/gi,
      ],
    },
    {
      weight: 1.0,
      patterns: [
        /\b(team|player|score|game|win|loss|draw|manager|coach)\b/gi,
      ],
    },
  ],
  cricket: [
    {
      weight: 3.0,
      patterns: [
        /\b(wicket|wickets|lbw|crease|bowler|batsman|batter|innings|over|overs|yorker|bouncer|spinner|maiden|powerplay|run.out|no.ball|caught|duck|slog|googly|cover.drive|sweep.shot)\b/gi,
      ],
    },
    {
      weight: 1.5,
      patterns: [
        /\b(six|sixes|four|fours|boundary|boundaries|umpire|appeal|century|fifty|fielder|pitch|cricker)\b/gi,
      ],
    },
    {
      weight: 1.0,
      patterns: [
        /\b(team|player|score|game|captain|match)\b/gi,
      ],
    },
  ],
  basketball: [
    {
      weight: 3.0,
      patterns: [
        /\b(dunk|dunks|three.pointer|buzzer.beater|layup|rebound|rebounds|point.guard|shooting.guard|small.forward|power.forward|basketball|nba|hoop|basket|free.throw|alley.oop|fast.break)\b/gi,
      ],
    },
    {
      weight: 1.5,
      patterns: [
        /\b(quarter|overtime|halftime|assist|assists|block|blocks|steal|steals|court|possession|foul|fouled)\b/gi,
      ],
    },
    {
      weight: 1.0,
      patterns: [
        /\b(team|player|score|game|coach)\b/gi,
      ],
    },
  ],
  mma: [
    {
      weight: 3.0,
      patterns: [
        /\b(knockout|tko|submission|tap.out|tapped.out|guillotine|armbar|rear.naked.choke|ground.and.pound|octagon|ufc|bellator|grappling|clinch|takedown|mount|half.guard|full.guard|referee.stoppage)\b/gi,
      ],
    },
    {
      weight: 1.5,
      patterns: [
        /\b(ko\b|cage|round|corner|striking|jab|cross|hook|kick|fighter|bout|main.event|undercard|weigh.in|championship)\b/gi,
      ],
    },
    {
      weight: 1.0,
      patterns: [
        /\b(fight|fighter|win|loss|belt|title|judge|decision)\b/gi,
      ],
    },
  ],
  esports: [
    {
      weight: 3.0,
      patterns: [
        /\b(respawn|spawn|dragon|baron|minion|lane|jungle|adc|moba|battle.royale|headshot|clutch|ace|elo|mmr|esport|gaming|fps|streamer|twitch)\b/gi,
      ],
    },
    {
      weight: 1.5,
      patterns: [
        /\b(kills|kill|deaths|death|objective|rank|ranked|mid|top|bot|support|tank|dps|damage|tower|nexus|carry)\b/gi,
      ],
    },
    {
      weight: 1.0,
      patterns: [
        /\b(team|player|tournament|champion|league|mvp|game|match)\b/gi,
      ],
    },
  ],
  interview: [
    {
      weight: 3.0,
      patterns: [
        /\b(interviewer|interviewee|exclusive interview|joined by|speaking with|in your opinion|from your perspective|walk us through|take us back|tell me about|how did it feel)\b/gi,
      ],
    },
    {
      weight: 1.5,
      patterns: [
        /\b(question|questions|asked|conversation|your thoughts|guest|host|talk about)\b/gi,
      ],
    },
    {
      weight: 1.0,
      patterns: [
        /\b(said|told|mentioned|discussed|shared)\b/gi,
      ],
    },
  ],
  tutorial: [
    {
      weight: 3.0,
      patterns: [
        /\b(tutorial|how.to|step.by.step|follow.along|let me show|here'?s how|beginner|advanced|demonstration|in this video|by the end of this|you will learn)\b/gi,
      ],
    },
    {
      weight: 1.5,
      patterns: [
        /\b(step|steps|guide|lesson|chapter|section|learn|learning|teach|teaching|course|lecture|exercise|practice)\b/gi,
      ],
    },
    {
      weight: 1.0,
      patterns: [
        /\b(first|next|finally|example|tip|trick|method)\b/gi,
      ],
    },
  ],
  vlog: [
    {
      weight: 3.0,
      patterns: [
        /\b(vlog|day.in.the.life|morning.routine|behind.the.scenes|filmed|filming|daily.life|day.\d+|travel.vlog|adventure)\b/gi,
      ],
    },
    {
      weight: 1.5,
      patterns: [
        /\b(today|yesterday|this.week|woke.up|went.to|lifestyle|routine|you.guys|follow.me|check.this.out)\b/gi,
      ],
    },
    {
      weight: 1.0,
      patterns: [
        /\b(trip|travel|fun|crazy|amazing|experience)\b/gi,
      ],
    },
  ],
  reaction: [
    {
      weight: 3.0,
      patterns: [
        /\b(react|reacting|reaction|first.time.watching|never.seen.before|watching.this.for.the.first.time|first.time.seeing)\b/gi,
      ],
    },
    {
      weight: 1.5,
      patterns: [
        /\b(oh.my.god|omg|no.way|can.you.believe|unbelievable|what.the|look.at.this|watching|first.time)\b/gi,
      ],
    },
    {
      weight: 1.0,
      patterns: [
        /\b(wow|crazy|insane|wild|amazing|unreal)\b/gi,
      ],
    },
  ],
  podcast: [
    {
      weight: 3.0,
      patterns: [
        /\b(podcast|spotify|apple.podcasts|patreon|ad.read|new.episode|this.week'?s.episode|welcome.back.to|intro|outro|subscribe.and|leave.a.review|listener|listeners)\b/gi,
      ],
    },
    {
      weight: 1.5,
      patterns: [
        /\b(episode|episodes|welcome.to|host|co.host|guest|sponsor|series|weekly|bi.weekly)\b/gi,
      ],
    },
    {
      weight: 1.0,
      patterns: [
        /\b(today.we|today.i|conversation|you.know|so.i.was)\b/gi,
      ],
    },
  ],
  documentary: [
    {
      weight: 3.0,
      patterns: [
        /\b(documentary|narrator|archive.footage|historically|records.show|scientists.discovered|phenomenon|decades.ago|centuries.ago|investigation.reveals|exposed|declassified)\b/gi,
      ],
    },
    {
      weight: 1.5,
      patterns: [
        /\b(narrat|according.to|evidence|research|study|studies|scientists|discovered|documented|found.that)\b/gi,
      ],
    },
    {
      weight: 1.0,
      patterns: [
        /\b(history|historical|years.ago|century|era|period|era)\b/gi,
      ],
    },
  ],
};

// ─── Score weights ──────────────────────────────────────────────────────────

const TRANSCRIPT_WEIGHT = 0.75;
const AUDIO_WEIGHT      = 0.15;
const VISUAL_WEIGHT     = 0.10;

// When transcript-only (skipVisual=true, no audio), lower threshold to 0.40
// since raw weighted scores are not bounded by normalization
const MIN_CONFIDENCE_THRESHOLD = 0.40;

// ─── Helpers ────────────────────────────────────────────────────────────────

function scoreTranscript(text: string): Record<ContentCategory, number> {
  const scores: Partial<Record<ContentCategory, number>> = {};

  for (const [category, groups] of Object.entries(KEYWORD_SIGNALS) as [ContentCategory, PatternGroup[]][]) {
    let weightedHits = 0;
    for (const group of groups) {
      for (const pattern of group.patterns) {
        // Reset lastIndex on global regex to avoid state issues
        pattern.lastIndex = 0;
        const matches = text.match(pattern);
        weightedHits += matches ? matches.length * group.weight : 0;
      }
    }
    scores[category] = weightedHits;
  }

  // Use raw weighted counts (not normalized) — we compare absolute hit strength
  return scores as Record<ContentCategory, number>;
}

/** 
 * Audio energy variance heuristic.
 * Sports/reaction content has higher variance (spikes) vs steady podcast speech.
 * Returns 0–1 where 1 = high variance (sports-like), 0 = steady (talk-like).
 */
async function getAudioVarianceSignal(videoPath: string): Promise<{ score: number; label: string }> {
  try {
    const nullSink = process.platform === 'win32' ? 'NUL' : '/dev/null';
    const { stderr } = await execFileAsync(
      getBinaryPath('ffmpeg'),
      ['-i', videoPath, '-af', 'volumedetect', '-f', 'null', nullSink],
      { timeout: 30000, maxBuffer: 1024 * 1024 }
    );

    const meanMatch = stderr.match(/mean_volume:\s*([\-\d.]+)\s*dB/);
    const maxMatch  = stderr.match(/max_volume:\s*([\-\d.]+)\s*dB/);

    if (!meanMatch || !maxMatch) {
      return { score: 0.5, label: 'unknown' };
    }

    const mean = parseFloat(meanMatch[1]);
    const max  = parseFloat(maxMatch[1]);
    const variance = Math.abs(max - mean);

    // High variance (> 20dB delta) → sports/reaction. Low variance (< 8dB) → podcast.
    let score = Math.min(1, Math.max(0, (variance - 8) / 22));
    const label = score > 0.65 ? 'high_variance_sports' : score > 0.35 ? 'medium' : 'steady_speech';

    return { score, label };
  } catch {
    return { score: 0.5, label: 'error' };
  }
}

/**
 * Simple frame color heuristic using FFmpeg thumbnail filter.
 * Detects dominant green hue → likely a sports field.
 * Returns sports-likelihood 0–1.
 */
async function getVisualSportsSignal(videoPath: string): Promise<{ score: number; label: string }> {
  try {
    const { stdout } = await execFileAsync(
      getBinaryPath('ffprobe'),
      [
        '-v', 'quiet',
        '-select_streams', 'v:0',
        '-show_entries', 'frame_tags=lavfi.signalstats.YAVG,lavfi.signalstats.UAVG,lavfi.signalstats.VAVG',
        '-of', 'csv=p=0',
        '-f', 'lavfi',
        `movie='${videoPath.replace(/\\/g, '/').replace(/:/g, '\\:')}',thumbnail=n=10,signalstats`,
      ],
      { timeout: 30000, maxBuffer: 512 * 1024 }
    );

    // Parse Y/U/V averages. Green hue in YUV: U < 120, V < 120, Y 80–160
    const lines = stdout.toString().trim().split('\n').filter(Boolean);
    let greenFrames = 0;
    let total = 0;

    for (const line of lines) {
      const parts = line.split(',').map(Number);
      if (parts.length >= 3) {
        const [y, u, v] = parts;
        total++;
        // Grass green in YUV: U ~100–120, V ~100–115, Y ~80–150
        if (y > 60 && y < 160 && u > 90 && u < 130 && v > 90 && v < 125) {
          greenFrames++;
        }
      }
    }

    if (total === 0) return { score: 0.3, label: 'no_frames' };

    const score = greenFrames / total;
    const label = score > 0.4 ? 'sports_field_likely' : 'indoor_or_mixed';
    return { score, label };
  } catch {
    return { score: 0.3, label: 'error' };
  }
}

/**
 * Picks the top category by raw weighted hit score.
 * Returns the category, its raw score, and the second-highest score for margin computation.
 */
function pickTopCategory(scores: Record<ContentCategory, number>): {
  category: ContentCategory;
  rawScore: number;
  secondScore: number;
} {
  let top: ContentCategory = 'podcast';
  let topScore = 0;
  let secondScore = 0;

  for (const [cat, score] of Object.entries(scores) as [ContentCategory, number][]) {
    if (score > topScore) {
      secondScore = topScore;
      topScore = score;
      top = cat;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  return { category: top, rawScore: topScore, secondScore };
}

// ─── Main export ────────────────────────────────────────────────────────────

export class CategoryClassifier {
  /**
   * Classify video content type.
   *
   * @param transcript  Full transcript text (may be empty)
   * @param videoPath   Path to the input video file
   * @param skipVisual  Skip slow YUV frame analysis (use when in a hurry)
   */
  public async classify(
    transcript: string,
    videoPath: string,
    skipVisual = false
  ): Promise<CategoryResult> {
    const start = Date.now();

    // ── Signal 1: Transcript keyword scoring ──────────────────────────
    const transcriptScores = transcript.trim()
      ? scoreTranscript(transcript)
      : Object.fromEntries(Object.keys(KEYWORD_SIGNALS).map(k => [k, 0])) as Record<ContentCategory, number>;

    const { category: transcriptCategory, rawScore: transcriptRaw, secondScore } = pickTopCategory(transcriptScores);

    // ── Margin-based confidence ────────────────────────────────────────
    // Confidence = how much the winner dominates the runner-up, 0–1.
    // e.g. winner=30 hits, runner-up=5 hits → margin = (30-5)/(30+5) = 71%
    // This is robust to transcript length; short texts get lower confidence.
    let transcriptConfidence = 0;
    if (transcriptRaw > 0) {
      transcriptConfidence = (transcriptRaw - secondScore) / (transcriptRaw + secondScore + 1e-6);
    }

    const transcriptSignal = transcript.trim()
      ? `${transcriptCategory} (raw: ${transcriptRaw.toFixed(1)}, margin: ${(transcriptConfidence * 100).toFixed(1)}%)`
      : 'no_transcript';

    // ── Signal 2: Audio variance ──────────────────────────────────────
    const audioResult = await getAudioVarianceSignal(videoPath);

    // ── Signal 3: Visual frame color (optional) ───────────────────────
    const visualResult = skipVisual
      ? { score: 0.3, label: 'skipped' }
      : await getVisualSportsSignal(videoPath);

    // ── Combine signals ───────────────────────────────────────────────
    let finalCategory = transcriptCategory;
    let confidence = 0;
    const isSportCategory = ['football', 'cricket', 'basketball', 'mma', 'esports'].includes(transcriptCategory);

    if (transcript.trim()) {
      // Primary confidence comes from transcript margin
      confidence =
        (transcriptConfidence * TRANSCRIPT_WEIGHT) +
        (audioResult.score * AUDIO_WEIGHT) +
        (visualResult.score * VISUAL_WEIGHT);

      // Bonus: if audio says high variance AND transcript says sport → boost confidence
      if (isSportCategory && audioResult.score > 0.6) {
        confidence = Math.min(1, confidence + 0.08);
      }

      // Bonus: if visual says grass field → bump sports categories
      if (visualResult.score > 0.4 && isSportCategory) {
        confidence = Math.min(1, confidence + 0.06);
      }
    } else {
      // No transcript → rely on audio + visual only
      if (audioResult.score > 0.7 && visualResult.score > 0.4) {
        finalCategory = 'football';
        confidence = 0.55;
      } else {
        finalCategory = 'podcast';
        confidence = 0.60;
      }
    }

    // ── Fallback if confidence too low ────────────────────────────────
    const fallback_used = confidence < MIN_CONFIDENCE_THRESHOLD;
    if (fallback_used) {
      finalCategory = 'podcast';
      console.log(`[CategoryClassifier]: Low confidence (${(confidence * 100).toFixed(1)}%) — falling back to 'podcast'.`);
    }

    const durationMs = Date.now() - start;
    console.log(
      `[CategoryClassifier]: Classified as '${finalCategory}' (confidence: ${(confidence * 100).toFixed(1)}%, ${durationMs}ms)`
    );

    return {
      category: finalCategory,
      confidence: Number(confidence.toFixed(4)),
      signals: {
        transcript_signal: transcriptSignal,
        audio_signal: audioResult.label,
        visual_signal: visualResult.label,
      },
      fallback_used,
    };
  }
}
