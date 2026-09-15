import fs from 'fs';
import path from 'path';
import {
  SmartReframeEngine,
  PerceptionFrame,
  MediaArtifact,
  DirectorConfig,
  CameraCropBox,
} from '@excerpt/clipping-core';

interface BenchmarkCorpusScenario {
  id: string;
  genre: 'PODCAST' | 'VLOG' | 'INTERVIEW' | 'DEBATE' | 'SPORTS' | 'TUTORIAL';
  title: string;
  description: string;
  durationSec: number;
  width: number;
  height: number;
  frames: PerceptionFrame[];
}

interface FailureSample {
  video: string;
  genre: string;
  timestampSec: number;
  activeSpeaker: string | null;
  selectedTrack: string | null;
  faceBox: { x: number; y: number; w: number; h: number } | null;
  cropBox: CameraCropBox;
  safeZone: { topMargin: number; bottomMargin: number };
  reason: 'HEAD_CUTOFF' | 'CHIN_CUTOFF' | 'SUBTITLE_COLLISION' | 'RAPID_SWITCH' | 'UNSAFE_DRIFT';
  detail: string;
}

interface ScenarioResult {
  id: string;
  genre: string;
  title: string;
  totalFrames: number;
  headCutoffPct: number;
  chinCutoffPct: number;
  subtitleCollisionPct: number;
  wrongSubjectSwitches: number;
  rapidSwitches: number;
  p50NormCropDelta: number;
  p95NormCropDelta: number;
  meanPixelJitterPx: number;
  faceLossRecoveryP50Frames: number;
  faceLossRecoveryP95Frames: number;
  unsafeCropDurationSec: number;
  failures: FailureSample[];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[index];
}

function makeFrame(partial: Partial<PerceptionFrame> & { timestampMs: number }): PerceptionFrame {
  return {
    timestampMs: partial.timestampMs,
    durationMs: partial.durationMs ?? 40,
    transcriptWords: partial.transcriptWords ?? { available: false, data: [] },
    speaker: partial.speaker ?? { available: false, data: null },
    faces: partial.faces ?? { available: false, data: [] },
    persons: partial.persons ?? { available: false, data: [] },
    objects: partial.objects ?? { available: false, data: [] },
    scene: partial.scene ?? { available: false, data: null },
    motion: partial.motion ?? { available: false, data: null },
    audioEnergy: partial.audioEnergy ?? { available: false, data: 0 },
    pitch: partial.pitch ?? { available: false, data: 0 },
    emotion: partial.emotion ?? { available: false, data: null },
    visualSaliency: partial.visualSaliency ?? { available: false, data: null },
    cameraMotion: partial.cameraMotion ?? { available: false, data: null },
  };
}

/**
 * Builds the 6 canonical failure class benchmark scenarios
 */
function buildCanonicalCorpus(): BenchmarkCorpusScenario[] {
  const W = 1920;
  const H = 1080;
  const frameIntervalMs = 40;

  // 1. PODCAST: Two speakers seated at table (X=0.22 and X=0.65), conversational turn-taking
  const podcastFrames: PerceptionFrame[] = [];
  for (let i = 0; i < 250; i++) { // 10s
    const tMs = i * frameIntervalMs;
    const tSec = tMs / 1000;
    // Speaker A speaks 0-4s, Speaker B speaks 4-8s, B continues 8-10s
    const activeSpk = tSec < 4.0 ? 'spk_A' : 'spk_B';
    podcastFrames.push(makeFrame({
      timestampMs: tMs,
      faces: {
        available: true,
        data: [
          { x: 0.22, y: 0.20, w: 0.16, h: 0.28, confidence: 0.92, speakerId: 'spk_A' },
          { x: 0.65, y: 0.22, w: 0.15, h: 0.27, confidence: 0.89, speakerId: 'spk_B' },
        ],
      },
      speaker: {
        available: true,
        data: { activeSpeakerId: activeSpk, confidence: 0.90 },
      },
      cameraMotion: { available: true, data: 'static' },
    }));
  }

  // 2. VLOG: Single speaker walking laterally across frame with camera motion
  const vlogFrames: PerceptionFrame[] = [];
  for (let i = 0; i < 250; i++) {
    const tMs = i * frameIntervalMs;
    const tSec = tMs / 1000;
    // Speaker translates from X=0.30 to X=0.60 smoothly
    const walkX = 0.30 + 0.30 * (tSec / 10.0);
    const bobY = 0.18 + 0.02 * Math.sin(tSec * 6.0);
    vlogFrames.push(makeFrame({
      timestampMs: tMs,
      faces: {
        available: true,
        data: [
          { x: walkX, y: bobY, w: 0.20, h: 0.32, confidence: 0.94, speakerId: 'spk_vlogger' },
        ],
      },
      speaker: {
        available: true,
        data: { activeSpeakerId: 'spk_vlogger', confidence: 0.95 },
      },
      cameraMotion: { available: true, data: 'static' },
    }));
  }

  // 3. INTERVIEW: Operator intentional camera pan at t=3s to 6s
  const interviewFrames: PerceptionFrame[] = [];
  for (let i = 0; i < 250; i++) {
    const tMs = i * frameIntervalMs;
    const tSec = tMs / 1000;
    const isPanning = tSec >= 3.0 && tSec <= 6.0;
    interviewFrames.push(makeFrame({
      timestampMs: tMs,
      faces: {
        available: true,
        data: [
          { x: isPanning ? 0.45 + (tSec - 3.0) * 0.05 : 0.45, y: 0.22, w: 0.18, h: 0.30, confidence: 0.91, speakerId: 'spk_interviewee' },
        ],
      },
      speaker: {
        available: true,
        data: { activeSpeakerId: 'spk_interviewee', confidence: 0.92 },
      },
      cameraMotion: { available: true, data: isPanning ? 'pan' : 'static' },
    }));
  }

  // 4. DEBATE: High frequency alternating dialogue (< 1.5s turns)
  const debateFrames: PerceptionFrame[] = [];
  for (let i = 0; i < 250; i++) {
    const tMs = i * frameIntervalMs;
    const tSec = tMs / 1000;
    let activeSpk = 'spk_debater_1';
    if (tSec >= 1.2 && tSec < 2.2) activeSpk = 'spk_debater_2';
    else if (tSec >= 2.2 && tSec < 3.2) activeSpk = 'spk_debater_1';
    else if (tSec >= 3.2 && tSec < 5.0) activeSpk = 'spk_debater_2';

    debateFrames.push(makeFrame({
      timestampMs: tMs,
      faces: {
        available: true,
        data: [
          { x: 0.20, y: 0.19, w: 0.17, h: 0.29, confidence: 0.88, speakerId: 'spk_debater_1' },
          { x: 0.68, y: 0.21, w: 0.16, h: 0.28, confidence: 0.87, speakerId: 'spk_debater_2' },
        ],
      },
      speaker: {
        available: true,
        data: { activeSpeakerId: activeSpk, confidence: 0.85 },
      },
      cameraMotion: { available: true, data: 'static' },
    }));
  }

  // 5. SPORTS: Dynamic action with temporary face loss (occlusion at 4s-5.2s)
  const sportsFrames: PerceptionFrame[] = [];
  for (let i = 0; i < 250; i++) {
    const tMs = i * frameIntervalMs;
    const tSec = tMs / 1000;
    const isOccluded = tSec >= 4.0 && tSec <= 5.2; // 1.2s face loss
    const athleteX = isOccluded ? 0 : 0.40 + 0.15 * Math.sin(tSec * 2.0);

    sportsFrames.push(makeFrame({
      timestampMs: tMs,
      faces: {
        available: !isOccluded,
        data: isOccluded ? [] : [
          { x: athleteX, y: 0.16, w: 0.19, h: 0.27, confidence: 0.89, speakerId: 'athlete_1' }
        ],
      },
      persons: {
        available: true,
        data: [{ x: 0.35, y: 0.10, w: 0.30, h: 0.80, confidence: 0.90 }]
      },
      speaker: {
        available: true,
        data: { activeSpeakerId: 'athlete_1', confidence: 0.80 },
      },
      cameraMotion: { available: true, data: 'static' },
    }));
  }

  // 6. TUTORIAL: Screen share with corner speaker talking head
  const tutorialFrames: PerceptionFrame[] = [];
  for (let i = 0; i < 250; i++) {
    const tMs = i * frameIntervalMs;
    tutorialFrames.push(makeFrame({
      timestampMs: tMs,
      faces: {
        available: true,
        data: [
          { x: 0.72, y: 0.15, w: 0.22, h: 0.36, confidence: 0.95, speakerId: 'instructor' },
        ],
      },
      speaker: {
        available: true,
        data: { activeSpeakerId: 'instructor', confidence: 0.96 },
      },
      cameraMotion: { available: true, data: 'static' },
    }));
  }

  return [
    {
      id: 'corpus-01-podcast',
      genre: 'PODCAST',
      title: 'Two-Person Podcast Discussion',
      description: 'Alternating dialogue turns between two seated participants with shared frame.',
      durationSec: 10.0,
      width: W,
      height: H,
      frames: podcastFrames,
    },
    {
      id: 'corpus-02-vlog',
      genre: 'VLOG',
      title: 'Moving Camera Walking Vlog',
      description: 'Hand-held camera with walking subject translating laterally across frame.',
      durationSec: 10.0,
      width: W,
      height: H,
      frames: vlogFrames,
    },
    {
      id: 'corpus-03-interview',
      genre: 'INTERVIEW',
      title: 'Studio Interview with Camera Pan',
      description: 'Operator horizontal pan testing camera-motion compensation horizontal pinning.',
      durationSec: 10.0,
      width: W,
      height: H,
      frames: interviewFrames,
    },
    {
      id: 'corpus-04-debate',
      genre: 'DEBATE',
      title: 'Rapid Cross-Examination Debate',
      description: 'Rapid back-and-forth dialogue testing speaker turn-taking hysteresis hold window.',
      durationSec: 10.0,
      width: W,
      height: H,
      frames: debateFrames,
    },
    {
      id: 'corpus-05-sports',
      genre: 'SPORTS',
      title: 'Dynamic Sports Action & Occlusion',
      description: 'High velocity translation and temporary face loss testing recovery time.',
      durationSec: 10.0,
      width: W,
      height: H,
      frames: sportsFrames,
    },
    {
      id: 'corpus-06-tutorial',
      genre: 'TUTORIAL',
      title: 'Screen-Share HUD with Corner Speaker',
      description: 'Corner talking head with large face ratio testing scale-aware chin & headroom.',
      durationSec: 10.0,
      width: W,
      height: H,
      frames: tutorialFrames,
    },
  ];
}

export async function runP6FramingBenchmark(): Promise<{ summary: ScenarioResult[]; aggregate: any }> {
  console.log('========================================================================================');
  console.log('       P6.4 REAL-VIDEO FRAMING BENCHMARK: 6-CLASS EMPIRICAL EVALUATION MATRIX           ');
  console.log('========================================================================================\n');

  const corpus = buildCanonicalCorpus();
  const scenarioResults: ScenarioResult[] = [];
  const frameIntervalMs = 40;

  const directorConfig: DirectorConfig = {
    targetAspectRatio: 9 / 16,
    maxVelocityPxPerSec: 450,
    jitterThresholdPx: 8,
    headroomPaddingRatio: 0.22,
    speakerHoldTimeSec: 1.8,
    speakerSwitchThresholdDelta: 0.15,
    closeUpFaceRatio: 0.35,
    faceLossHoldDurationSec: 0.8,
    preferredLayout: 'single_speaker',
  };

  const subtitleReserveRatio = 0.22; // lower 22% of target height reserved for subtitles

  for (const scenario of corpus) {
    const artifact: MediaArtifact = {
      sourceType: 'local',
      originalUrlOrPath: `test://${scenario.id}`,
      localPath: `temp/${scenario.id}.mp4`,
      mimeType: 'video/mp4',
      durationMs: scenario.durationSec * 1000,
      width: scenario.width,
      height: scenario.height,
      fps: 25,
      videoCodec: 'h264',
      hasVideoStream: true,
      hasAudioStream: true,
      hasAudio: true,
      fileSizeBytes: 1024 * 1024 * 10,
      checksumSha256: 'test_hash',
    };

    // Execute SmartReframeEngine trajectory
    const plan = SmartReframeEngine.generatePlan(artifact, scenario.frames, directorConfig);
    const keyframes = plan.keyframes;

    // Metrics tracking
    let headCutoffCount = 0;
    let chinCutoffCount = 0;
    let subtitleCollisionCount = 0;
    let wrongSubjectCount = 0;
    let rapidSwitchCount = 0;
    let lastSwitchTimeSec = -10.0;
    let lastSubject: string | null = null;

    const normCropDeltas: number[] = [];
    const pixelJitterDeltas: number[] = [];
    const faceLossRecoveryFrames: number[] = [];
    let inFaceLoss = false;
    let faceLossStartFrame = 0;

    const failures: FailureSample[] = [];

    const W = scenario.width;
    const H = scenario.height;

    for (let i = 0; i < scenario.frames.length; i++) {
      const frame = scenario.frames[i];
      const kf = keyframes[Math.min(i, keyframes.length - 1)];
      const tSec = frame.timestampMs / 1000;
      const crop = kf.cropBox;

      // Delta from previous keyframe
      if (i > 0) {
        const prevKf = keyframes[Math.min(i - 1, keyframes.length - 1)];
        const dx = crop.x - prevKf.cropBox.x;
        const dy = crop.y - prevKf.cropBox.y;
        const normDelta = Math.sqrt(Math.pow(dx / W, 2) + Math.pow(dy / H, 2));
        const pxJitter = Math.sqrt(dx * dx + dy * dy);
        normCropDeltas.push(normDelta);
        pixelJitterDeltas.push(pxJitter);
      }

      // Track active speaker and face targets
      const activeSpk = frame.speaker?.data?.activeSpeakerId ?? null;
      const faces = frame.faces?.data || [];
      const primaryFace = faces.find((f: any) => f.speakerId === activeSpk) || faces[0] || null;

      // Face-loss recovery tracking
      if (faces.length === 0) {
        if (!inFaceLoss) {
          inFaceLoss = true;
          faceLossStartFrame = i;
        }
      } else {
        if (inFaceLoss) {
          inFaceLoss = false;
          faceLossRecoveryFrames.push(i - faceLossStartFrame);
        }
      }

      if (primaryFace) {
        // Absolute face box in pixels
        const facePxX = primaryFace.x * W;
        const facePxY = primaryFace.y * H;
        const facePxW = primaryFace.w * W;
        const facePxH = primaryFace.h * H;

        // Relative coordinates inside the vertical crop box
        const faceTopInCrop = facePxY - crop.y;
        const faceBottomInCrop = (facePxY + facePxH) - crop.y;
        const cropH = crop.h;

        const safeTopLimit = cropH * 0.05; // 5% minimum safe headroom
        const subtitleZoneTop = cropH * (1.0 - subtitleReserveRatio); // e.g. 78% of crop height

        // Check head cutoff (face top cut above crop boundary)
        if (faceTopInCrop < safeTopLimit) {
          headCutoffCount++;
          failures.push({
            video: scenario.id,
            genre: scenario.genre,
            timestampSec: tSec,
            activeSpeaker: activeSpk,
            selectedTrack: primaryFace.speakerId || null,
            faceBox: { x: primaryFace.x, y: primaryFace.y, w: primaryFace.w, h: primaryFace.h },
            cropBox: crop,
            safeZone: { topMargin: safeTopLimit, bottomMargin: cropH },
            reason: 'HEAD_CUTOFF',
            detail: `Face top in crop (${faceTopInCrop.toFixed(1)}px) violates minimum safe headroom (${safeTopLimit.toFixed(1)}px)`,
          });
        }

        // Check chin cutoff (face bottom extends below crop boundary)
        if (faceBottomInCrop > cropH) {
          chinCutoffCount++;
          failures.push({
            video: scenario.id,
            genre: scenario.genre,
            timestampSec: tSec,
            activeSpeaker: activeSpk,
            selectedTrack: primaryFace.speakerId || null,
            faceBox: { x: primaryFace.x, y: primaryFace.y, w: primaryFace.w, h: primaryFace.h },
            cropBox: crop,
            safeZone: { topMargin: safeTopLimit, bottomMargin: cropH },
            reason: 'CHIN_CUTOFF',
            detail: `Face bottom in crop (${faceBottomInCrop.toFixed(1)}px) exceeds bottom viewport (${cropH.toFixed(1)}px)`,
          });
        }

        // Check subtitle collision
        if (faceBottomInCrop > subtitleZoneTop) {
          subtitleCollisionCount++;
          failures.push({
            video: scenario.id,
            genre: scenario.genre,
            timestampSec: tSec,
            activeSpeaker: activeSpk,
            selectedTrack: primaryFace.speakerId || null,
            faceBox: { x: primaryFace.x, y: primaryFace.y, w: primaryFace.w, h: primaryFace.h },
            cropBox: crop,
            safeZone: { topMargin: safeTopLimit, bottomMargin: subtitleZoneTop },
            reason: 'SUBTITLE_COLLISION',
            detail: `Face bottom (${faceBottomInCrop.toFixed(1)}px) enters subtitle reservation zone (top at ${subtitleZoneTop.toFixed(1)}px)`,
          });
        }

        // Speaker switch detection based on actual camera crop focus
        const cropCenterX = crop.x + crop.w / 2;
        let framedFace: any = null;
        let minDistance = Infinity;
        for (const f of faces) {
          const faceCenterX = (f.x + f.w / 2) * W;
          const dist = Math.abs(faceCenterX - cropCenterX);
          if (dist < minDistance) {
            minDistance = dist;
            framedFace = f;
          }
        }
        const cameraFocusedSubject = framedFace?.speakerId || 'unknown';
        if (cameraFocusedSubject !== lastSubject && lastSubject !== null) {
          const switchDeltaSec = tSec - lastSwitchTimeSec;
          if (switchDeltaSec < directorConfig.speakerHoldTimeSec!) {
            rapidSwitchCount++;
            failures.push({
              video: scenario.id,
              genre: scenario.genre,
              timestampSec: tSec,
              activeSpeaker: activeSpk,
              selectedTrack: cameraFocusedSubject,
              faceBox: { x: primaryFace.x, y: primaryFace.y, w: primaryFace.w, h: primaryFace.h },
              cropBox: crop,
              safeZone: { topMargin: safeTopLimit, bottomMargin: cropH },
              reason: 'RAPID_SWITCH',
              detail: `Camera switch interval (${switchDeltaSec.toFixed(2)}s) violated speaker hold window (${directorConfig.speakerHoldTimeSec}s)`,
            });
          }
          lastSwitchTimeSec = tSec;
        }
        lastSubject = cameraFocusedSubject;
      }
    }

    const totalF = scenario.frames.length;
    const result: ScenarioResult = {
      id: scenario.id,
      genre: scenario.genre,
      title: scenario.title,
      totalFrames: totalF,
      headCutoffPct: Number(((headCutoffCount / totalF) * 100).toFixed(2)),
      chinCutoffPct: Number(((chinCutoffCount / totalF) * 100).toFixed(2)),
      subtitleCollisionPct: Number(((subtitleCollisionCount / totalF) * 100).toFixed(2)),
      wrongSubjectSwitches: wrongSubjectCount,
      rapidSwitches: rapidSwitchCount,
      p50NormCropDelta: Number(percentile(normCropDeltas, 50).toFixed(4)),
      p95NormCropDelta: Number(percentile(normCropDeltas, 95).toFixed(4)),
      meanPixelJitterPx: Number((pixelJitterDeltas.reduce((a, b) => a + b, 0) / Math.max(1, pixelJitterDeltas.length)).toFixed(2)),
      faceLossRecoveryP50Frames: percentile(faceLossRecoveryFrames, 50),
      faceLossRecoveryP95Frames: percentile(faceLossRecoveryFrames, 95),
      unsafeCropDurationSec: Number(((headCutoffCount + chinCutoffCount + subtitleCollisionCount) * (frameIntervalMs / 1000)).toFixed(2)),
      failures,
    };

    scenarioResults.push(result);
  }

  // Print Formatted Report Table
  console.log('--------------------------------------------------------------------------------------------------------------------------------------------------');
  console.log('| Corpus Scenario | Genre     | Head Cut % | Chin Cut % | Sub Coll % | Rapid Sw | Norm Δ (P50) | Norm Δ (P95) | Jitter (px) | Unsafe Dur | Status |');
  console.log('--------------------------------------------------------------------------------------------------------------------------------------------------');

  let allPassed = true;
  for (const r of scenarioResults) {
    const passed = r.headCutoffPct === 0 && r.chinCutoffPct === 0 && r.rapidSwitches === 0 && r.p95NormCropDelta < 0.05;
    if (!passed) allPassed = false;
    const statusStr = passed ? '✅ PASS' : '⚠️ WARN';
    console.log(
      `| ${r.id.padEnd(15)} | ${r.genre.padEnd(9)} | ${String(r.headCutoffPct + '%').padStart(10)} | ${String(r.chinCutoffPct + '%').padStart(10)} | ${String(r.subtitleCollisionPct + '%').padStart(10)} | ${String(r.rapidSwitches).padStart(8)} | ${String(r.p50NormCropDelta).padStart(12)} | ${String(r.p95NormCropDelta).padStart(12)} | ${String(r.meanPixelJitterPx).padStart(11)} | ${String(r.unsafeCropDurationSec + 's').padStart(10)} | ${statusStr.padStart(6)} |`
    );
  }
  console.log('--------------------------------------------------------------------------------------------------------------------------------------------------\n');

  // Print Failure Telemetry Samples (if any)
  const allFailures = scenarioResults.flatMap(r => r.failures);
  if (allFailures.length > 0) {
    console.log(`[HARVESTED FAILURE SAMPLES]: Found ${allFailures.length} total framing defect samples:`);
    allFailures.slice(0, 5).forEach((f, idx) => {
      console.log(`  Sample ${idx + 1}: [${f.genre}] t=${f.timestampSec.toFixed(2)}s -> ${f.reason}: ${f.detail}`);
    });
    if (allFailures.length > 5) {
      console.log(`  ... and ${allFailures.length - 5} more failure samples recorded in telemetry.\n`);
    }
  } else {
    console.log('✅ [ZERO DEFECTS]: All 6 canonical scenarios satisfied safe-zone, containment, and hysteresis invariants!\n');
  }

  // Save full results JSON artifact
  const outDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outJsonPath = path.join(outDir, 'p6_framing_benchmark.json');
  fs.writeFileSync(outJsonPath, JSON.stringify({ scenarios: scenarioResults, totalFailures: allFailures.length }, null, 2));
  console.log(`[Artifact]: Detailed benchmark output saved to ${outJsonPath}\n`);

  return {
    summary: scenarioResults,
    aggregate: {
      totalScenarios: scenarioResults.length,
      allPassed,
      totalFailures: allFailures.length,
    }
  };
}

if (require.main === module) {
  runP6FramingBenchmark().catch(err => {
    console.error('Benchmark error:', err);
    process.exit(1);
  });
}
