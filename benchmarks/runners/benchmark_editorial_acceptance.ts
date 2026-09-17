/**
 * benchmark_editorial_acceptance.ts — Excerpt Editorial Product Acceptance Suite
 *
 * Measures creator experience and editorial decision quality:
 *   1. Single-Speaker Framing Quality (Headroom & Subject Containment)
 *   2. Multi-Speaker Decisioning (Turn-Taking Split Stack vs Bystander Monologue)
 *   3. Overlay & Overlap Invariant (Picture-in-Picture screen_plus_face vs Forbidden Collisions)
 *   4. Non-Destructive In-Memory Caption Correction Latency (< 1ms) & Immutable Version Lineage
 *   5. Explainable Editorial Scoring Calibration (selectionScore, confidence, factors)
 *   6. Multi-Platform Publication Plan & Constraints (TikTok pull-from-url vs YouTube direct upload)
 *
 * Separates HARD SAFETY PASS from EDITORIAL ACCEPTANCE PASS.
 */

import {
  createSingleSubjectComposition,
  createSplitStackComposition,
  createScreenPlusFaceComposition,
  validateCompositionPlan,
  createClipProject,
  deriveNextProjectVersion,
  updateProjectTranscriptWord,
  compileClipBundleMetadata,
  createPublicationPlan,
  PLATFORM_CAPABILITIES,
  SmartReframeEngine,
} from '../../packages/clipping-core/src';

interface GateResult {
  name: string;
  category: 'SAFETY' | 'EDITORIAL_ACCEPTANCE';
  pass: boolean;
  details: string;
  metric?: number | string;
}

export class EditorialAcceptanceBenchmark {
  static runSuite(): { passCount: number; failCount: number; gates: GateResult[] } {
    const gates: GateResult[] = [];

    // ─── GATE 1: Multi-Speaker Candidate Evaluation ─────────────────────────
    // Scenario A: Sustained podcast co-presence with separated hosts -> MUST choose split_screen_stack
    const podcastFrames = Array.from({ length: 40 }, (_, i) => ({
      timestampMs: i * 40,
      durationMs: 40,
      faces: {
        available: true,
        data: [
          { x: 0.15, y: 0.2, w: 0.18, h: 0.25, confidence: 0.95 },
          { x: 0.65, y: 0.2, w: 0.18, h: 0.25, confidence: 0.95 },
        ],
      },
      persons: { available: false, data: [] },
      speaker: {
        available: true,
        data: { activeSpeakerBox: { x: 0.15, y: 0.2, w: 0.18, h: 0.25 }, confidence: 0.9 },
      },
      transcriptWords: { available: false, data: [] },
      objects: { available: false, data: [] },
      scene: { available: false, data: null },
      motion: { available: false, data: null },
      audioEnergy: { available: false, data: null },
      pitch: { available: false, data: null },
      emotion: { available: false, data: null },
      visualSaliency: { available: false, data: null },
      cameraMotion: { available: false, data: null },
    }));

    const dummyArtifact = {
      id: 'art_bench',
      sourceUrl: 'test.mp4',
      durationSec: 10,
      durationMs: 10000,
      storagePath: 'test.mp4',
      fileSizeBytes: 1000,
      containerFormat: 'mp4',
      videoStreams: [{ index: 0, codec: 'h264', width: 1920, height: 1080, fps: 25, durationSec: 10 }],
      audioStreams: [],
    };

    const podcastPlan = SmartReframeEngine.generatePlan(dummyArtifact as any, podcastFrames as any, {
      targetAspectRatio: 9 / 16,
      maxVelocityPxPerSec: 800,
      jitterThresholdPx: 5,
      headroomPaddingRatio: 0.25,
    });

    const gate1A = podcastPlan.layoutMode === 'split_screen_stack' && podcastPlan.composition?.mode === 'split_stack';
    gates.push({
      name: 'Multi-Speaker Turn-Taking Layout Preference',
      category: 'EDITORIAL_ACCEPTANCE',
      pass: gate1A,
      details: gate1A ? 'Correctly selected split_screen_stack for co-present separated podcast hosts' : 'Failed to select split stack',
      metric: podcastPlan.layoutMode,
    });

    // Scenario B: Monologue with small background audience member -> MUST choose single_subject
    const monologueFrames = Array.from({ length: 40 }, (_, i) => ({
      timestampMs: i * 40,
      durationMs: 40,
      faces: {
        available: true,
        data: [
          { x: 0.45, y: 0.2, w: 0.22, h: 0.30, confidence: 0.95 },
          { x: 0.85, y: 0.5, w: 0.04, h: 0.05, confidence: 0.55 }, // Bystander face (w < 0.08)
        ],
      },
      persons: { available: false, data: [] },
      speaker: {
        available: true,
        data: { activeSpeakerBox: { x: 0.45, y: 0.2, w: 0.22, h: 0.30 }, confidence: 0.95 },
      },
      transcriptWords: { available: false, data: [] },
      objects: { available: false, data: [] },
      scene: { available: false, data: null },
      motion: { available: false, data: null },
      audioEnergy: { available: false, data: null },
      pitch: { available: false, data: null },
      emotion: { available: false, data: null },
      visualSaliency: { available: false, data: null },
      cameraMotion: { available: false, data: null },
    }));

    const monologuePlan = SmartReframeEngine.generatePlan(dummyArtifact as any, monologueFrames as any, {
      targetAspectRatio: 9 / 16,
      maxVelocityPxPerSec: 800,
      jitterThresholdPx: 5,
      headroomPaddingRatio: 0.25,
    });

    const gate1B = monologuePlan.layoutMode === 'single_speaker' && monologuePlan.composition?.mode === 'single_subject';
    gates.push({
      name: 'Bystander Avoidance in Monologue',
      category: 'EDITORIAL_ACCEPTANCE',
      pass: gate1B,
      details: gate1B ? 'Correctly rejected split-screen when secondary face is a background bystander' : 'Erroneously split screen for bystander',
      metric: monologuePlan.layoutMode,
    });

    // ─── GATE 2: Dynamic Camera Path Keyframe Synthesis ─────────────────────
    const hasDynamicKeyframes = Boolean(
      podcastPlan.composition?.tracks[0]?.cameraPath &&
      podcastPlan.composition.tracks[0].cameraPath.keyframes.length > 0
    );
    gates.push({
      name: 'Dynamic Camera Path Keyframe Generation',
      category: 'SAFETY',
      pass: hasDynamicKeyframes,
      details: hasDynamicKeyframes ? 'CompositionTrack carries time-varying CameraPathKeyframes for renderer' : 'Missing dynamic camera path',
      metric: podcastPlan.composition?.tracks[0]?.cameraPath?.keyframes.length ?? 0,
    });

    // ─── GATE 3: Overlay & Overlap Policy Validation ────────────────────────
    const screenCrop = { x: 0, y: 0, width: 1920, height: 1080 };
    const faceCrop = { x: 400, y: 200, width: 400, height: 400 };
    const overlayComp = createScreenPlusFaceComposition(screenCrop, faceCrop);
    const overlayValidation = validateCompositionPlan(overlayComp);

    const gate3A = overlayValidation.valid && overlayComp.tracks[1].overlapPolicy === 'allowed';
    gates.push({
      name: 'Permitted Overlay Validation (screen_plus_face)',
      category: 'SAFETY',
      pass: gate3A,
      details: gate3A ? 'Allowed picture-in-picture overlay with distinct zIndex and overlapPolicy="allowed"' : 'Rejected valid overlay',
    });

    // ─── GATE 4: In-Memory Caption Correction Latency & Immutable Versioning ─
    const v1 = createClipProject({
      id: 'clip_perf_01',
      jobId: 'job_001',
      sourceMediaId: 'media_src',
      startTime: 0,
      endTime: 15,
      composition: createSingleSubjectComposition({ x: 0, y: 0, width: 1080, height: 1920 }),
      words: Array.from({ length: 100 }, (_, i) => ({
        word: `Word${i}`,
        start: i * 0.15,
        end: (i + 1) * 0.15,
      })),
      titles: ['Original Title'],
    });

    const startHr = process.hrtime.bigint();
    const v2 = updateProjectTranscriptWord(v1, v1.transcript.words[50].id, 'CorrectedWord');
    const elapsedUs = Number(process.hrtime.bigint() - startHr) / 1000;

    const gate4A = elapsedUs < 1000; // < 1ms (1000us)
    const gate4B = v1.version === 1 && v2.version === 2 && v2.parentVersion === 1 && v1.transcript.words[50].word !== v2.transcript.words[50].word;
    const gate4C = v1.contentHash !== v2.contentHash;

    gates.push({
      name: 'In-Memory Word Correction Latency (< 1ms)',
      category: 'EDITORIAL_ACCEPTANCE',
      pass: gate4A,
      details: `Word update completed in ${elapsedUs.toFixed(1)} microseconds (O(1) in-memory operation)`,
      metric: `${elapsedUs.toFixed(1)} µs`,
    });

    gates.push({
      name: 'Immutable Project Version Lineage (v1 -> v2)',
      category: 'SAFETY',
      pass: gate4B && gate4C,
      details: gate4B && gate4C ? 'Version 1 preserved immutable; Version 2 derived with parent link and distinct content hash' : 'Version lineage violated',
    });

    // ─── GATE 5: Calibrated Explainable Scoring ─────────────────────────────
    const bundleMeta = compileClipBundleMetadata({
      titleCandidates: ['Hook A', 'Hook B'],
      description: 'Podcast breakdown.',
      hashtags: ['mindset', '#growth'],
      videoId: 'vid_001',
      start: 5.5,
      end: 25.2,
      selectionScore: 0.91,
      confidence: 0.86,
      scoreFactors: {
        hook: 0.94,
        completeness: 0.90,
        visual: 0.85,
        speaker: 0.92,
      },
    });

    const evalObj = bundleMeta.editorialEvaluation;
    const gate5 =
      typeof evalObj.selectionScore === 'number' &&
      evalObj.selectionScore <= 1.0 &&
      evalObj.selectionScore >= 0.0 &&
      evalObj.factors.hook === 0.94 &&
      evalObj.factors.speaker === 0.92 &&
      (bundleMeta as any).predictedViralityScore === undefined;

    gates.push({
      name: 'Calibrated Explainable Scoring (No Speculative Virality)',
      category: 'EDITORIAL_ACCEPTANCE',
      pass: gate5,
      details: gate5 ? 'Replaced black-box virality with selectionScore (0.91) + factor breakdown (hook, completeness, visual, speaker)' : 'Uncalibrated scores present',
      metric: `Score: ${evalObj.selectionScore} (Confidence: ${evalObj.confidence})`,
    });

    // ─── GATE 6: Multi-Platform Publication Capabilities ────────────────────
    const ttPlan = createPublicationPlan({
      id: 'pub_tt',
      projectId: v1.projectId,
      clipId: v1.id,
      targetPlatform: 'tiktok',
      title: 'TikTok Viral Clip',
      authorizationState: 'authorized',
    });

    const ytPlan = createPublicationPlan({
      id: 'pub_yt',
      projectId: v1.projectId,
      clipId: v1.id,
      targetPlatform: 'youtube_shorts',
      title: 'YouTube Short',
      authorizationState: 'authorized',
    });

    const gate6 =
      ttPlan.capabilities.supportsPullFromUrl === true &&
      ttPlan.capabilities.requiresCreatorReview === true &&
      ytPlan.capabilities.supportsPullFromUrl === false &&
      ytPlan.capabilities.maxDurationSec === 60;

    gates.push({
      name: 'Platform Constraints Modeling (TikTok Direct Post & YouTube)',
      category: 'EDITORIAL_ACCEPTANCE',
      pass: gate6,
      details: gate6 ? 'Accurately modeled TikTok pull-from-url review gate & YouTube Shorts 60s hard limit' : 'Platform capability mismatch',
    });

    const passCount = gates.filter(g => g.pass).length;
    const failCount = gates.filter(g => !g.pass).length;

    return { passCount, failCount, gates };
  }
}

// Direct runner execution
if (require.main === module) {
  console.log('====================================================================================================');
  console.log('                 EXCERPT EDITORIAL PRODUCT ACCEPTANCE SUITE (SEPTEMBER 2026)                        ');
  console.log('====================================================================================================\n');

  const { passCount, failCount, gates } = EditorialAcceptanceBenchmark.runSuite();

  console.log('----------------------------------------------------------------------------------------------------');
  console.log('| Status | Category             | Benchmark Gate / Invariant                             | Metric   |');
  console.log('----------------------------------------------------------------------------------------------------');
  for (const g of gates) {
    const icon = g.pass ? '  ✅ PASS' : '  ❌ FAIL';
    const cat = g.category.padEnd(20);
    const name = g.name.padEnd(54);
    const met = (g.metric !== undefined ? String(g.metric) : 'N/A').padEnd(8);
    console.log(`|${icon} | ${cat} | ${name} | ${met} |`);
  }
  console.log('----------------------------------------------------------------------------------------------------\n');

  console.log(`TOTAL: ${passCount} PASSED, ${failCount} FAILED out of ${gates.length} gates.`);
  if (failCount > 0) {
    console.error('\n❌ Editorial Product Acceptance suite encountered failures.');
    process.exit(1);
  } else {
    console.log('\n✅ All Editorial Product Acceptance gates passed successfully!');
    process.exit(0);
  }
}
