import { RankingProfile } from './types';

export const STANDARD_PROFILE: RankingProfile = {
  id: 'standard',
  version: '1.0.0',
  description: 'Balanced default profile for general clips.',
  weights: {
    hook: 0.20,
    story: 0.20,
    emotion: 0.15,
    visualInterest: 0.10,
    informationDensity: 0.10,
    topicRelevance: 0.10,
    speakerQuality: 0.05,
    platformFit: 0.05,
    novelty: 0.05
  },
  diversity: {
    timeDiversityPenalty: 0.2, // Penalize clips that are temporally close
    topicDiversityPenalty: 0.1
  }
};

export const PODCAST_PROFILE: RankingProfile = {
  id: 'podcast',
  version: '1.0.0',
  description: 'Optimized for long-form dialogue and deep topics.',
  weights: {
    hook: 0.15,
    story: 0.15,
    emotion: 0.10,
    visualInterest: 0.05,
    informationDensity: 0.25,
    topicRelevance: 0.15,
    speakerQuality: 0.10,
    platformFit: 0.02,
    novelty: 0.03
  },
  diversity: {
    timeDiversityPenalty: 0.1,
    topicDiversityPenalty: 0.3
  }
};

export const PROFILES: Record<string, RankingProfile> = {
  standard: STANDARD_PROFILE,
  podcast: PODCAST_PROFILE
};

/**
 * Validates that no single metric in a profile exceeds the strict 30% dominance limit.
 */
export function validateProfile(profile: RankingProfile): void {
  const sum = Object.values(profile.weights).reduce((a, b) => a + b, 0);
  
  for (const [metric, weight] of Object.entries(profile.weights)) {
    const relativeWeight = weight / sum;
    if (relativeWeight > 0.30) {
      throw new Error(`Dominance ceiling violated in profile '${profile.id}': Metric '${metric}' contributes ${Math.round(relativeWeight * 100)}% (> 30%).`);
    }
  }
}
