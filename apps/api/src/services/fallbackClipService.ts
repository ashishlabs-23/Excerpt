interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface FallbackClipSegment {
  id: string;
  video_url: string;
  start_time: number;
  end_time: number;
  content: string;
  title: string;
  transcript_excerpt?: string;
  virality_score: number;
  clip_score?: number;
  hook?: string;
  summary?: string;
  reason?: string;
  face_focus_score?: number;
  score_breakdown?: {
    speech_energy: number;
    emotion_score: number;
    keyword_importance: number;
    face_presence_score: number;
    motion_intensity: number;
  };
}

interface CandidateWindow {
  start: number;
  end: number;
  duration: number;
  score: number;
  text: string;
  hookText: string;
  payoffText: string;
  titleSeed: string;
  description: string;
  reason: string;
  faceFocusScore: number;
  scoreBreakdown: {
    speech_energy: number;
    emotion_score: number;
    keyword_importance: number;
    face_presence_score: number;
    motion_intensity: number;
  };
}

const hookPatterns = [
  /\bhow\b/i,
  /\bwhy\b/i,
  /\bhere'?s\b/i,
  /\bthis is why\b/i,
  /\bthe reason\b/i,
  /\bthe truth\b/i,
  /\bsecret\b/i,
  /\bmistake\b/i,
  /\bwhat happened\b/i,
  /\bi learned\b/i,
  /\bi realized\b/i,
  /\bnobody\b/i,
  /\beverybody\b/i,
  /\bnever\b/i,
  /\bbest\b/i,
  /\bworst\b/i,
  /\bfirst\b/i,
  /\bonly\b/i,
  /\bimagine\b/i,
  /\bturns out\b/i,
];

const payoffPatterns = [
  /\bso\b/i,
  /\bthat'?s why\b/i,
  /\bwhich means\b/i,
  /\bthe point is\b/i,
  /\bthe lesson\b/i,
  /\bthe key\b/i,
  /\bwhat that means\b/i,
  /\bresult\b/i,
  /\bended up\b/i,
  /\bturns out\b/i,
  /\bbecause\b/i,
  /\btherefore\b/i,
];

const emotionPatterns = [
  /\binsane\b/i,
  /\bcrazy\b/i,
  /\bshocking\b/i,
  /\bwild\b/i,
  /\bunbelievable\b/i,
  /\bamazing\b/i,
  /\bscared\b/i,
  /\bafraid\b/i,
  /\bexcited\b/i,
  /\bterrible\b/i,
  /\bhuge\b/i,
  /\bmassive\b/i,
];

const insightPatterns = [
  /\bstrategy\b/i,
  /\bsystem\b/i,
  /\bframework\b/i,
  /\bprocess\b/i,
  /\bfix\b/i,
  /\bproblem\b/i,
  /\bsolution\b/i,
  /\bbuild\b/i,
  /\bgrow\b/i,
  /\bscale\b/i,
  /\bmoney\b/i,
  /\bbusiness\b/i,
  /\bcontent\b/i,
  /\baudience\b/i,
  /\battention\b/i,
];

const contrastPatterns = [
  /\bbut\b/i,
  /\bhowever\b/i,
  /\binstead\b/i,
  /\byet\b/i,
  /\bexcept\b/i,
  /\buntil\b/i,
  /\bthen\b/i,
];

const lowSignalPatterns = [
  /\bhey\b/i,
  /\bhi\b/i,
  /\bhello\b/i,
  /\bwelcome back\b/i,
  /\bnice to meet you\b/i,
  /\bthanks for watching\b/i,
  /\blike and subscribe\b/i,
  /\bsubscribe\b/i,
  /\blet'?s go\b/i,
  /\ball right\b/i,
  /\bokay\b/i,
  /\bcome on\b/i,
  /\bchat\b/i,
  /\b3e\b/i,
  /\b4d\b/i,
];

const fillerPattern = /\b(um|uh|erm|like|you know|sort of|kind of|basically|literally)\b/gi;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeSegment(segment: any): TranscriptSegment | null {
  if (
    typeof segment?.start !== 'number' ||
    typeof segment?.end !== 'number' ||
    typeof segment?.text !== 'string'
  ) {
    return null;
  }

  const text = segment.text.replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }

  return {
    start: Math.max(0, segment.start),
    end: Math.max(segment.end, segment.start),
    text,
  };
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function tokenizeWords(text: string): string[] {
  return text.match(/\b[\w']+\b/g) || [];
}

function alphaTokenCount(tokens: string[]): number {
  return tokens.filter((token) => /[a-z]/i.test(token)).length;
}

function numericTokenCount(tokens: string[]): number {
  return tokens.filter((token) => /^\d+(?:\.\d+)?$/.test(token)).length;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function firstSentence(text: string): string {
  return splitSentences(text)[0] || text.replace(/\s+/g, ' ').trim();
}

function sentenceScore(sentence: string, sentenceIndex: number, totalSentences: number): number {
  const tokens = tokenizeWords(sentence);
  const hookHits = countMatches(sentence, hookPatterns);
  const payoffHits = countMatches(sentence, payoffPatterns);
  const emotionHits = countMatches(sentence, emotionPatterns);
  const insightHits = countMatches(sentence, insightPatterns);
  const contrastHits = countMatches(sentence, contrastPatterns);
  const lowSignalHits = countMatches(sentence, lowSignalPatterns);
  const numberHits = numericTokenCount(tokens);
  const punctuationHits = /[!?]/.test(sentence) ? 1 : 0;
  const words = tokens.length;
  const alphaWords = alphaTokenCount(tokens);
  const shortTokens = tokens.filter((token) => token.length <= 2).length;
  const earlyPositionBoost = sentenceIndex <= Math.max(0, Math.floor(totalSentences / 3)) ? 4 : 0;
  const numericPenalty = numberHits > Math.max(2, Math.floor(words * 0.2)) ? 12 : 0;
  const lowLanguagePenalty = alphaWords < Math.max(4, Math.floor(words * 0.45)) ? 16 : 0;
  const shortTokenPenalty = shortTokens > Math.floor(words * 0.4) ? 10 : 0;

  return (
    hookHits * 10 +
    payoffHits * 6 +
    emotionHits * 4 +
    insightHits * 4 +
    contrastHits * 3 +
    numberHits * 4 +
    punctuationHits * 3 +
    clamp(words, 6, 18) +
    earlyPositionBoost -
    lowSignalHits * 16 -
    numericPenalty -
    lowLanguagePenalty -
    shortTokenPenalty
  );
}

function sanitizePhrase(text: string): string {
  return text
    .replace(fillerPattern, '')
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTitle(text: string, fallbackIndex: number): string {
  const cleaned = sanitizePhrase(text);
  if (!cleaned) {
    return `Viral Moment ${fallbackIndex + 1}`;
  }

  const words = cleaned.split(' ').filter(Boolean).slice(0, 10);
  const title = words
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word
    )
    .join(' ');

  return title.length > 64 ? `${title.slice(0, 61).trimEnd()}...` : title;
}

function buildDescription(sentences: string[]): string {
  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      score: sentenceScore(sentence, index, sentences.length),
      index,
      alphaWords: alphaTokenCount(tokenizeWords(sentence)),
    }))
    .filter((item) => item.alphaWords >= 4)
    .sort((left, right) => right.score - left.score);

  const selectedIndexes = ranked
    .slice(0, Math.min(2, ranked.length))
    .map((item) => item.index)
    .sort((left, right) => left - right);

  const summary = selectedIndexes
    .map((index) => sentences[index])
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const safeSummary = summary || sentences.join(' ').replace(/\s+/g, ' ').trim();
  return safeSummary.length > 190 ? `${safeSummary.slice(0, 187).trimEnd()}...` : safeSummary;
}

function normalizeUnit(value: number): number {
  return Number(clamp(value, 0, 1).toFixed(4));
}

function toPercentScore(value: number): number {
  return Math.round(clamp(value, 0, 1) * 100);
}

function buildSelectionReason(scoreBreakdown: CandidateWindow['scoreBreakdown']) {
  const strengths = [
    { key: 'speech energy', value: scoreBreakdown.speech_energy },
    { key: 'emotion', value: scoreBreakdown.emotion_score },
    { key: 'keyword density', value: scoreBreakdown.keyword_importance },
    { key: 'face focus potential', value: scoreBreakdown.face_presence_score },
    { key: 'motion', value: scoreBreakdown.motion_intensity },
  ]
    .sort((left, right) => right.value - left.value)
    .slice(0, 2)
    .map((entry) => entry.key);

  if (strengths.length === 0) {
    return 'Balanced short-form candidate with a clean hook and complete payoff.';
  }

  return `Strong ${strengths.join(' and ')} with a complete, platform-native payoff.`;
}

function overlapRatio(
  first: { start: number; end: number },
  second: { start: number; end: number }
): number {
  const overlap = Math.max(0, Math.min(first.end, second.end) - Math.max(first.start, second.start));
  const shorter = Math.max(1, Math.min(first.end - first.start, second.end - second.start));
  return overlap / shorter;
}

function buildCandidateWindow(windowSegments: TranscriptSegment[]): CandidateWindow | null {
  if (windowSegments.length === 0) {
    return null;
  }

  const start = windowSegments[0].start;
  const end = windowSegments[windowSegments.length - 1].end;
  const duration = end - start;
  if (duration <= 0) {
    return null;
  }

  const text = windowSegments.map((segment) => segment.text).join(' ').replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }

  const sentences = splitSentences(text);
  const tokens = tokenizeWords(text);
  const wordCount = tokens.length;
  const alphaWords = alphaTokenCount(tokens);
  const numericWords = numericTokenCount(tokens);
  const shortTokens = tokens.filter((token) => token.length <= 2).length;
  const uniqueAlphaWords = new Set(
    tokens
      .filter((token) => /[a-z]/i.test(token))
      .map((token) => token.toLowerCase())
  ).size;
  const firstBoundary = start + duration * 0.32;
  const lastBoundary = end - duration * 0.32;
  const hookText = windowSegments
    .filter((segment) => segment.start < firstBoundary)
    .map((segment) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const payoffText = windowSegments
    .filter((segment) => segment.end > lastBoundary)
    .map((segment) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hookHits = countMatches(hookText, hookPatterns);
  const payoffHits = countMatches(payoffText, payoffPatterns);
  const emotionHits = countMatches(text, emotionPatterns);
  const insightHits = countMatches(text, insightPatterns);
  const contrastHits = countMatches(text, contrastPatterns);
  const lowSignalHits = countMatches(hookText, lowSignalPatterns) + countMatches(payoffText, lowSignalPatterns);
  const fillerHits = (text.match(fillerPattern) || []).length;
  const numberHits = numericWords;
  const density = wordCount / Math.max(duration, 1);
  const alphaRatio = alphaWords / Math.max(wordCount, 1);
  const uniqueAlphaRatio = uniqueAlphaWords / Math.max(alphaWords, 1);
  const densityScore =
    density >= 1.5 && density <= 4.8
      ? 12
      : density > 1.1 && density < 5.6
        ? 6
        : -10;
  const sentenceRichness = clamp(sentences.length, 1, 7) * 2;
  const structureBonus = hookHits > 0 && payoffHits > 0 ? 18 : hookHits > 0 ? 8 : 0;
  const startPenalty = start < 12 && lowSignalHits > 0 ? 18 : 0;
  const thinContentPenalty = duration >= 28 && wordCount < 55 ? 22 : 0;
  const repetitivePenalty = sentences.length <= 2 && emotionHits > 0 && insightHits === 0 ? 16 : 0;
  const numericNoisePenalty = numberHits > Math.max(4, Math.floor(wordCount * 0.18)) ? 30 : 0;
  const lowLanguagePenalty = alphaRatio < 0.62 ? 26 : alphaRatio < 0.72 ? 12 : 0;
  const shortTokenPenalty = shortTokens > Math.floor(wordCount * 0.38) ? 20 : 0;
  const repetitionPenalty = uniqueAlphaRatio < 0.42 ? 18 : 0;
  const lowSignalPenalty = lowSignalHits * 16 + fillerHits * 2;

  const rankedSentences = sentences
    .map((sentence, index) => ({
      sentence,
      score: sentenceScore(sentence, index, sentences.length),
      alphaWords: alphaTokenCount(tokenizeWords(sentence)),
    }))
    .filter((item) => item.alphaWords >= 4)
    .sort((left, right) => right.score - left.score);
  const titleSeed = rankedSentences[0]?.sentence || sentences[0] || text;
  const description = buildDescription(sentences.length > 0 ? sentences : [text]);
  const densityNormalized = clamp((density - 1.1) / 2.8, 0, 1);
  const hookNormalized = clamp((hookHits * 0.24) + (structureBonus > 0 ? 0.18 : 0), 0, 1);
  const payoffNormalized = clamp((payoffHits * 0.22) + (structureBonus > 0 ? 0.12 : 0), 0, 1);
  const emotionNormalized = clamp((emotionHits * 0.22) + (/[!?]/.test(text) ? 0.08 : 0) + contrastHits * 0.05, 0, 1);
  const insightNormalized = clamp((insightHits * 0.18) + numberHits * 0.04 + uniqueAlphaRatio * 0.2, 0, 1);
  const lowSignalPressure = clamp((lowSignalPenalty + startPenalty + repetitivePenalty) / 100, 0, 0.5);
  const languagePenalty = clamp((lowLanguagePenalty + shortTokenPenalty + repetitionPenalty + numericNoisePenalty) / 100, 0, 0.55);

  const speechEnergy = normalizeUnit(
    0.18 +
      densityNormalized * 0.42 +
      hookNormalized * 0.22 +
      contrastHits * 0.04 +
      sentenceRichness / 30 -
      lowSignalPressure -
      languagePenalty * 0.4
  );
  const emotionScore = normalizeUnit(
    0.12 +
      emotionNormalized * 0.52 +
      hookNormalized * 0.12 +
      payoffNormalized * 0.1 -
      lowSignalPressure * 0.8
  );
  const keywordImportance = normalizeUnit(
    0.16 +
      insightNormalized * 0.48 +
      hookNormalized * 0.14 +
      payoffNormalized * 0.08 -
      languagePenalty * 0.6
  );
  const facePresenceScore = normalizeUnit(
    0.56 +
      hookNormalized * 0.08 +
      payoffNormalized * 0.05 -
      lowSignalPressure * 0.25 -
      languagePenalty * 0.15
  );
  const motionIntensity = normalizeUnit(
    0.12 +
      contrastHits * 0.14 +
      emotionNormalized * 0.18 +
      densityNormalized * 0.16 +
      (/[!?]/.test(hookText) ? 0.08 : 0) -
      lowSignalPressure * 0.35
  );

  const scoreBreakdown = {
    speech_energy: speechEnergy,
    emotion_score: emotionScore,
    keyword_importance: keywordImportance,
    face_presence_score: facePresenceScore,
    motion_intensity: motionIntensity,
  };

  const score =
    (speechEnergy * 0.30) +
    (emotionScore * 0.25) +
    (keywordImportance * 0.20) +
    (facePresenceScore * 0.15) +
    (motionIntensity * 0.10);
  const reason = buildSelectionReason(scoreBreakdown);

  return {
    start: Number(start.toFixed(2)),
    end: Number(end.toFixed(2)),
    duration: Number(duration.toFixed(2)),
    score: toPercentScore(score),
    text,
    hookText,
    payoffText,
    titleSeed,
    description,
    reason,
    faceFocusScore: toPercentScore(facePresenceScore),
    scoreBreakdown,
  };
}

export const fallbackClipService = {
  detectClips({
    segments,
    videoUrl,
    numClips = 2,
    totalDuration,
    excludedZones,
  }: {
    segments: any[];
    videoUrl: string;
    numClips?: number;
    totalDuration: number;
    excludedZones?: { start: number; end: number }[];
  }): FallbackClipSegment[] {
    const normalizedSegments = segments
      .map(normalizeSegment)
      .filter((segment): segment is TranscriptSegment => segment !== null);

    if (normalizedSegments.length === 0) {
      throw new Error('No transcript segments were available for heuristic clip planning.');
    }

    const safeDuration = Math.max(
      1,
      Number.isFinite(totalDuration)
        ? totalDuration
        : normalizedSegments[normalizedSegments.length - 1].end
    );

    if (safeDuration < 30) {
      const fullWindow = buildCandidateWindow(normalizedSegments);
      const fullText = normalizedSegments.map((segment) => segment.text).join(' ').replace(/\s+/g, ' ').trim();
      const sentences = splitSentences(fullText);
      const titleSeed = fullWindow?.titleSeed || sentences[0] || fullText;
      return [
        {
          id: 'heuristic_clip_1',
          video_url: videoUrl,
          // Short source videos should render as a single complete clip.
          start_time: 0,
          end_time: Number(safeDuration.toFixed(2)),
          title: buildTitle(titleSeed, 0),
          content: fullWindow?.description || buildDescription(sentences.length > 0 ? sentences : [fullText]),
          transcript_excerpt: fullText.length > 600 ? `${fullText.slice(0, 597).trimEnd()}...` : fullText,
          virality_score: fullWindow?.score || clamp(
            66 + countMatches(fullText, hookPatterns) * 4 + countMatches(fullText, emotionPatterns) * 2,
            64,
            86
          ),
          clip_score: fullWindow?.score,
          hook: firstSentence(fullWindow?.hookText || fullText),
          summary: fullWindow?.description || buildDescription(sentences.length > 0 ? sentences : [fullText]),
          reason: fullWindow?.reason || 'Complete short-source segment with a clear hook and payoff.',
          face_focus_score: fullWindow?.faceFocusScore || 58,
          score_breakdown: fullWindow?.scoreBreakdown || {
            speech_energy: 0.62,
            emotion_score: 0.58,
            keyword_importance: 0.6,
            face_presence_score: 0.58,
            motion_intensity: 0.44,
          },
        },
      ];
    }

    const minDuration = 15;
    const maxDuration = 45;
    const step = normalizedSegments.length > 350 ? 3 : normalizedSegments.length > 180 ? 2 : 1;
    const candidates: CandidateWindow[] = [];

    for (let startIndex = 0; startIndex < normalizedSegments.length; startIndex += step) {
      const startSegment = normalizedSegments[startIndex];
      let bestCandidate: CandidateWindow | null = null;

      for (let endIndex = startIndex; endIndex < normalizedSegments.length; endIndex++) {
        const duration = normalizedSegments[endIndex].end - startSegment.start;

        if (duration < minDuration) {
          continue;
        }

        if (duration > maxDuration) {
          break;
        }

        const candidate = buildCandidateWindow(normalizedSegments.slice(startIndex, endIndex + 1));
        if (!candidate) {
          continue;
        }

        if (excludedZones && excludedZones.length > 0) {
          let overlapsExcluded = false;
          const windowSize = Math.max(30, safeDuration / 20);
          const candBuffer = Math.max(10, windowSize * 0.25);
          const candStart = candidate.start - candBuffer;
          const candEnd = candidate.end + candBuffer;

          for (const zone of excludedZones) {
            const zoneDuration = zone.end - zone.start;
            const zoneBuffer = Math.max(10, windowSize * 0.25);
            const exclStart = zone.start - zoneBuffer;
            const exclEnd = zone.end + zoneBuffer;

            if (candStart < exclEnd && exclStart < candEnd) {
              overlapsExcluded = true;
              break;
            }
          }

          if (overlapsExcluded) {
            continue;
          }
        }

        if (!bestCandidate || candidate.score > bestCandidate.score) {
          bestCandidate = candidate;
        }
      }

      if (bestCandidate) {
        candidates.push(bestCandidate);
      }
    }

    const selected = candidates
      .sort((left, right) => right.score - left.score)
      .reduce<CandidateWindow[]>((accumulator, candidate) => {
        if (accumulator.length >= numClips) {
          return accumulator;
        }

        const conflicts = accumulator.some((existing) => overlapRatio(existing, candidate) > 0.55);
        if (!conflicts) {
          accumulator.push(candidate);
        }

        return accumulator;
      }, []);

    if (selected.length === 0) {
      throw new Error('Heuristic clip planner could not create any high-signal clip windows.');
    }

    return selected.slice(0, numClips).map((candidate, index) => ({
      id: `heuristic_clip_${index + 1}`,
      video_url: videoUrl,
      start_time: candidate.start,
      end_time: candidate.end,
      title: buildTitle(candidate.titleSeed, index),
      content: candidate.description || candidate.text,
      transcript_excerpt: candidate.text.length > 700 ? `${candidate.text.slice(0, 697).trimEnd()}...` : candidate.text,
      virality_score: clamp(Math.round(candidate.score), 68, 97),
      clip_score: clamp(Math.round(candidate.score), 68, 97),
      hook: firstSentence(candidate.hookText || candidate.text),
      summary: candidate.description || candidate.text,
      reason: candidate.reason,
      face_focus_score: candidate.faceFocusScore,
      score_breakdown: candidate.scoreBreakdown,
    }));
  },
};
