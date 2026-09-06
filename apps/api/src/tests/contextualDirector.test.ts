import { ContextualDirectorEngine, FramingLevel, getDirectorProfile } from '@excerpt/clipping-core';

describe('ContextualDirectorEngine (Phase C — Contextual Director & Adaptive Framing)', () => {
  const director = new ContextualDirectorEngine();

  it('enforces Ponytail Rule: does NOT punch in when sentence is strong but visual/emotion event is absent', () => {
    const clip = {
      candidateId: 'cand-conservative-01',
      startSec: 0.0,
      endSec: 15.0,
      genre: 'Podcast',
      words: [
        { word: 'This', start: 0.0, end: 0.3 },
        { word: 'is', start: 0.4, end: 0.6 },
        { word: 'a', start: 0.7, end: 0.8 },
        { word: 'completely', start: 0.9, end: 1.4 },
        { word: 'normal', start: 1.5, end: 1.9 },
        { word: 'statement.', start: 2.0, end: 2.5 },
      ],
    };

    // Perception with no emotion peaks
    const perception = {
      faces: [{ x: 0.45, y: 0.25, w: 0.2, h: 0.25, confidence: 0.95 }],
      emotionPeaks: [],
    };

    const plan = director.planDirection(clip, perception);
    expect(plan.selectedPlanType).toBe('conservative');
    expect(plan.interventions.length).toBe(0);
    expect(plan.shots[0].zoomScale).toBe(1.0);
    expect(plan.qualityGate.passed).toBe(true);
  });

  it('generates contextual punch-in when justified by high emotion spike + semantic climax', () => {
    const clip = {
      candidateId: 'cand-punch-02',
      startSec: 0.0,
      endSec: 18.0,
      genre: 'Podcast',
      words: [
        { word: 'We', start: 0.0, end: 0.3 },
        { word: 'lost', start: 0.4, end: 0.7 },
        { word: 'two', start: 0.8, end: 1.1 },
        { word: 'million', start: 5.5, end: 6.2 },
        { word: 'dollars!', start: 6.3, end: 7.0 },
      ],
    };

    const perception = {
      faces: [{ x: 0.45, y: 0.25, w: 0.2, h: 0.25, confidence: 0.95 }],
      emotionPeaks: [
        { timestampSec: 6.0, score: 0.95, emotion: 'shock' },
      ],
    };

    const plan = director.planDirection(clip, perception);
    expect(plan.selectedPlanType).toBe('contextual_punch');
    expect(plan.interventions.length).toBe(1);
    expect(plan.interventions[0].targetScale).toBeGreaterThan(1.0);
    expect(plan.interventions[0].targetScale).toBeLessThanOrEqual(1.18);
    expect(plan.qualityGate.passed).toBe(true);
    expect(plan.qualityGate.headCutoffDetected).toBe(false);
  });

  it('enforces minHoldDurationSec to prevent hyper-metronomic camera switching', () => {
    const clip = {
      candidateId: 'cand-hold-03',
      startSec: 0.0,
      endSec: 12.0,
      genre: 'Interview', // Interview has 3.5s hold requirement
      words: [
        { word: 'First', start: 2.0, end: 2.5 },
        { word: 'Second', start: 3.5, end: 4.0 }, // Only 1.5s after first peak
      ],
    };

    const perception = {
      faces: [{ x: 0.45, y: 0.25, w: 0.2, h: 0.25, confidence: 0.92 }],
      emotionPeaks: [
        { timestampSec: 2.2, score: 0.92, emotion: 'anger' },
        { timestampSec: 3.8, score: 0.95, emotion: 'excitement' }, // Too close!
      ],
    };

    const plan = director.planDirection(clip, perception);
    // Second peak must be rejected due to minHoldDuration constraint
    expect(plan.interventions.length).toBeLessThanOrEqual(1);
    expect(plan.qualityGate.unnecessaryInterventionCount).toBe(0);
  });

  it('generates speaker_aware split-screen stack when multiple speakers are present in debate/podcast', () => {
    const clip = {
      candidateId: 'cand-split-04',
      startSec: 0.0,
      endSec: 15.0,
      genre: 'Debate',
    };

    const perception = {
      faces: [
        { x: 0.2, y: 0.25, w: 0.2, h: 0.25, confidence: 0.92 },
        { x: 0.7, y: 0.25, w: 0.2, h: 0.25, confidence: 0.88 },
      ],
    };

    const plan = director.planDirection(clip, perception);
    expect(plan.selectedPlanType).toBe('speaker_aware');
    expect(plan.shots[0].framing).toBe(FramingLevel.SPLIT_SCREEN_STACK);
    expect(plan.qualityGate.passed).toBe(true);
  });

  it('loads genre-specific profiles tailored to Tutorial, Sports, and Gaming', () => {
    const sportsProfile = getDirectorProfile('Sports');
    const tutorialProfile = getDirectorProfile('Tutorial');

    // Tutorial forbids high punch-in to preserve screen action
    expect(tutorialProfile.maxZoomScale).toBeLessThanOrEqual(1.06);
    expect(tutorialProfile.interventionThreshold).toBeGreaterThan(85);

    // Sports has high motion weight
    expect(sportsProfile.weights.motion).toBeGreaterThanOrEqual(0.35);
  });

  it('strictly preserves clip boundaries from winning EditorialPlan', () => {
    const clip = {
      candidateId: 'cand-boundary-invariant',
      startSec: 12.35,
      endSec: 28.70,
      genre: 'News',
    };

    const plan = director.planDirection(clip);
    const duration = Number((clip.endSec - clip.startSec).toFixed(2));
    const totalShotDuration = plan.shots.reduce((acc, s) => acc + s.durationSec, 0);

    expect(Number(totalShotDuration.toFixed(2))).toBe(duration);
    expect(plan.candidateId).toBe('cand-boundary-invariant');
  });
});
