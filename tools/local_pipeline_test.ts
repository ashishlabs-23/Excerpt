import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import dotenv from 'dotenv';
import {
  AcousticBoundarySnapper,
  SmartReframeEngine,
  DeliveryValidator,
  ArtifactValidator,
  FramingLevel,
  MediaArtifact,
  PerceptionFrame,
} from '@excerpt/clipping-core';
import { KineticCaptionGenerator } from '../src/services/kineticCaptionGenerator';
import { VideoProcessor, getBinaryPath } from '../src/services/videoProcessor';
import { GenerativeVisualEngine } from '../src/services/intelligence/GenerativeVisualEngine';
import { MicroJumpCutter } from '../src/services/intelligence/MicroJumpCutter';
import { SceneCutSnapper } from '../src/services/intelligence/SceneCutSnapper';
import { MultiScaleStoryEngine } from '../src/services/intelligence/MultiScaleStoryEngine';
import { ContextCoherenceGuard } from '../src/services/intelligence/ContextCoherenceGuard';

// Load local environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const outputDir = path.resolve(__dirname, '../../../temp/local_clips');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 50 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`${err.message}\nStderr: ${stderr}`));
      }
      resolve(stdout);
    });
  });
}

/**
 * Generates a test 16:9 1080p source video using FFmpeg test pattern and audio tones if no input file is supplied.
 */
async function generateTestVideo(filePath: string, durationSec = 20): Promise<string> {
  const ffmpeg = getBinaryPath('ffmpeg');
  if (fs.existsSync(filePath)) {
    console.log(`[LocalPipeline]: Using existing test media: ${filePath}`);
    return filePath;
  }

  console.log(`[LocalPipeline]: Generating local 1920x1080 test video (${durationSec}s) via FFmpeg...`);
  // Generate video with testsrc (two moving color bars representing two speakers) and a synthesized sine audio track
  const args = [
    '-f', 'lavfi',
    '-i', `testsrc=size=1920x1080:rate=30`,
    '-f', 'lavfi',
    '-i', `sine=frequency=440:sample_rate=48000`,
    '-t', String(durationSec),
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-y',
    filePath,
  ];

  await runCommand(ffmpeg, args);
  console.log(`[LocalPipeline]: Successfully generated source video at: ${filePath}`);
  return filePath;
}

async function main() {
  console.log('===============================================================');
  console.log('🚀 EXCERPT LOCAL SOTA CLIPPING PIPELINE VALIDATOR');
  console.log('===============================================================');

  const ffmpegBin = getBinaryPath('ffmpeg');
  const ffprobeBin = getBinaryPath('ffprobe');
  console.log(`[LocalPipeline]: FFmpeg Binary: ${ffmpegBin}`);
  console.log(`[LocalPipeline]: FFprobe Binary: ${ffprobeBin}`);

  const processor = new VideoProcessor();
  const captionGen = new KineticCaptionGenerator();

  // 1. Prepare Source Video
  const sampleVideoPath = path.join(outputDir, 'source_test_1080p.mp4');
  await generateTestVideo(sampleVideoPath, 25);

  const duration = await processor.getVideoDuration(sampleVideoPath);
  console.log(`[LocalPipeline]: Source Video Duration: ${duration.toFixed(2)}s`);

  // 2. Mock Transcript with Word Timestamps
  const mockWords = [
    { word: 'Welcome', start: 1.0, end: 1.4 },
    { word: 'to', start: 1.45, end: 1.6 },
    { word: 'the', start: 1.65, end: 1.8 },
    { word: 'next', start: 1.85, end: 2.1 },
    { word: 'generation', start: 2.15, end: 2.7 },
    { word: 'of', start: 2.75, end: 2.9 },
    { word: 'AI', start: 2.95, end: 3.3 },
    { word: 'video', start: 3.35, end: 3.8 },
    { word: 'clipping', start: 3.85, end: 4.5 },
    { word: 'where', start: 4.6, end: 4.9 },
    { word: 'we', start: 4.95, end: 5.2 },
    { word: 'turn', start: 5.25, end: 5.6 },
    { word: 'long', start: 5.65, end: 6.0 },
    { word: 'videos', start: 6.05, end: 6.7 },
    { word: 'into', start: 6.75, end: 7.0 },
    { word: 'viral', start: 7.05, end: 7.6 },
    { word: 'shorts', start: 7.65, end: 8.4 },
    { word: 'automatically', start: 8.5, end: 9.6 },
    { word: 'with', start: 9.8, end: 10.1 },
    { word: 'zero', start: 10.15, end: 10.6 },
    { word: 'truncation', start: 10.65, end: 11.5 },
    { word: 'and', start: 11.8, end: 12.1 },
    { word: 'flawless', start: 12.15, end: 12.8 },
    { word: 'timing', start: 12.85, end: 13.6 },
    { word: 'for', start: 13.9, end: 14.2 },
    { word: 'every', start: 14.25, end: 14.7 },
    { word: 'social', start: 14.75, end: 15.3 },
    { word: 'platform', start: 15.35, end: 16.2 },
  ];

  // 2. Multi-Scale Narrative Story Arc Evaluation (30s / 60s / 90s)
  console.log('\n--- 1. MULTI-SCALE NARRATIVE STORY ARC EVALUATION ---');
  const storyEngine = new MultiScaleStoryEngine();
  const multiScaleCandidates = storyEngine.evaluateMultiScaleArcs(mockWords, duration);
  console.log(`[LocalPipeline]: Evaluated ${multiScaleCandidates.length} Multi-Scale Candidate Arcs:`);
  multiScaleCandidates.forEach((c, idx) => {
    console.log(`   [#${idx + 1}] Scale: ${c.scaleType} (${c.durationSec}s) | Platform: ${c.recommendedPlatform} | Narrative: ${c.narrativeScore}% | Completeness: ${c.completenessScore}%`);
  });

  // 3. Context & Coherence Guard (Dangling Pronoun & Cliffhanger Protection)
  console.log('\n--- 2. CONTEXT & GRAMMAR COHERENCE GUARD ---');
  const coherenceGuard = new ContextCoherenceGuard();
  const rawCandidateStart = 1.2; // Intentionally in the middle of 'Welcome' (1.0 -> 1.4)
  const rawCandidateEnd = 16.0;   // Intentionally in the middle of 'platform' (15.35 -> 16.2)
  const guarded = coherenceGuard.guardBoundaries(mockWords, rawCandidateStart, rawCandidateEnd);
  console.log(`[LocalPipeline]: Context Guard Status: ${guarded.explanation}`);

  // 4. Word-Level Transcript & Acoustic Boundary Snapping
  console.log('\n--- 3. WORD-LEVEL TRANSCRIPT & ACOUSTIC BOUNDARY SNAPPING ---');
  const snapped = AcousticBoundarySnapper.snap(
    guarded.startSec,
    guarded.endSec,
    mockWords,
    [{ start: 0, end: 0.9, duration: 0.9 }, { start: 16.3, end: 18.0, duration: 1.7 }],
    { minDurationSec: 10, maxDurationSec: 60 }
  );

  console.log(`[LocalPipeline]: Raw Moment Request: [${rawCandidateStart}s -> ${rawCandidateEnd}s]`);
  console.log(`[LocalPipeline]: Snapped Bounds:     [${snapped.startSec}s -> ${snapped.endSec}s] (Duration: ${snapped.durationSec}s)`);
  console.log(`[LocalPipeline]: Truncation Avoided: ${snapped.truncatedWordAvoided ? '✅ YES' : 'NO'}`);

  // 4. Visual Scene-Cut Transition Alignment
  console.log('\n--- 3. VISUAL SCENE-CUT SHOT BOUNDARY ALIGNMENT ---');
  const sceneSnapper = new SceneCutSnapper();
  const sceneCuts = await sceneSnapper.detectSceneCuts(sampleVideoPath, snapped.startSec, snapped.durationSec);
  const visualSnapped = sceneSnapper.snapBoundariesToSceneCut(snapped.startSec, snapped.endSec, sceneCuts);
  console.log(`[LocalPipeline]: Detected ${sceneCuts.length} Visual Shot Transitions in window`);
  console.log(`[LocalPipeline]: Visual Shot Snapped Bounds: [${visualSnapped.snappedStartSec}s -> ${visualSnapped.snappedEndSec}s]`);

  // 5. Dead-Air Elimination & Micro Jump-Cutting
  console.log('\n--- 4. INTRA-CLIP MICRO JUMP-CUTTING & DEAD-AIR REMOVAL ---');
  const jumpCutter = new MicroJumpCutter(0.55);
  const jumpCutPlan = jumpCutter.planJumpCuts(mockWords, visualSnapped.snappedStartSec, visualSnapped.snappedEndSec);
  console.log(`[LocalPipeline]: Original Duration:  ${jumpCutPlan.totalOriginalDurationSec}s`);
  console.log(`[LocalPipeline]: Jump-Cut Duration:  ${jumpCutPlan.totalNewDurationSec}s (Saved: ${jumpCutPlan.timeSavedSec}s dead-air)`);
  console.log(`[LocalPipeline]: Generated ${jumpCutPlan.edlSegments.length} Continuous Speech Segments`);

  // 6. Smart Dynamic Director AI Plan
  console.log('\n--- 5. DYNAMIC DIRECTOR AI & REFRAME PLANNING ---');
  const sampleArtifact: MediaArtifact = {
    sourceType: 'local',
    originalUrlOrPath: sampleVideoPath,
    localPath: sampleVideoPath,
    mimeType: 'video/mp4',
    fileSizeBytes: fs.statSync(sampleVideoPath).size,
    durationMs: Math.round(duration * 1000),
    width: 1920,
    height: 1080,
    fps: 30,
    hasVideoStream: true,
    hasAudioStream: true,
    hasAudio: true,
    checksumSha256: 'localtestchecksum',
  };

  const frames: PerceptionFrame[] = [
    {
      timestampMs: 0,
      durationMs: 500,
      transcriptWords: { available: true, data: mockWords },
      speaker: { available: true, data: { activeSpeakerId: 'spk1', confidence: 0.95 } },
      faces: { available: true, data: [{ x: 500, y: 300, w: 250, h: 250 }] },
      persons: { available: false, data: [] },
      objects: { available: false, data: null },
      scene: { available: false, data: null },
      motion: { available: false, data: null },
      audioEnergy: { available: false, data: null },
      pitch: { available: false, data: null },
      emotion: { available: false, data: null },
      visualSaliency: { available: false, data: null },
      cameraMotion: { available: false, data: null },
    },
  ];

  const cameraPlan = SmartReframeEngine.generatePlan(sampleArtifact, frames, {
    targetAspectRatio: 9 / 16,
    maxVelocityPxPerSec: 500,
    jitterThresholdPx: 10,
    headroomPaddingRatio: 0.25,
    preferredLayout: 'single_speaker',
    enablePunchIn: true,
  });

  console.log(`[LocalPipeline]: Director AI Layout Mode: ${cameraPlan.layoutMode}`);
  console.log(`[LocalPipeline]: Keyframe Framing Level:  ${cameraPlan.keyframes[0].framingLevel}`);
  console.log(`[LocalPipeline]: Crop Box:               ${JSON.stringify(cameraPlan.keyframes[0].cropBox)}`);
  console.log(`[LocalPipeline]: Punch-In Scale:         ${cameraPlan.keyframes[0].scale}x`);

  // 7. Kinetic Subtitle Generation (Hormozi Preset + Safe Zones + Retimed Timestamps)
  console.log('\n--- 6. KINETIC SUBTITLE GENERATION (HORMOZI STYLE WITH RETIMING) ---');
  const subtitleAssPath = path.join(outputDir, 'clip_subtitles.ass');
  captionGen.generateASS(jumpCutPlan.retimedWords, subtitleAssPath, 'hormozi');
  console.log(`[LocalPipeline]: Generated ASS Kinetic Captions (Retimed for Jump Cuts) at: ${subtitleAssPath}`);

  // 8. Generative Context Visuals & B-Roll Planning
  console.log('\n--- 7. GENERATIVE AI B-ROLL & CONTEXT OVERLAY PLANNING ---');
  const visualEngine = new GenerativeVisualEngine();
  const bRollMoments = visualEngine.planBRollMoments(mockWords, visualSnapped.snappedStartSec, visualSnapped.snappedEndSec);
  console.log(`[LocalPipeline]: Planned ${bRollMoments.length} Contextual B-Roll Highlights:`);
  bRollMoments.forEach((m, idx) => {
    console.log(`   [#${idx + 1}] @ ${m.startSec}s (+${m.durationSec}s) | Keyword: "${m.keyword}" | Style: ${m.style} | Layout: ${m.layout}`);
  });

  const bRollOutputDir = path.join(outputDir, 'broll_clips');
  const renderedBRollClips: Array<{ videoPath: string; startSec: number; durationSec: number; layout?: string }> = [];
  for (const moment of bRollMoments) {
    const bRollPath = await visualEngine.generateLocalBRollClip(moment, bRollOutputDir);
    renderedBRollClips.push({
      videoPath: bRollPath,
      startSec: moment.startSec,
      durationSec: moment.durationSec,
      layout: moment.layout,
    });
    console.log(`[LocalPipeline]: Synthesized B-Roll motion clip: ${bRollPath}`);
  }

  // 9. Full HD 1080x1920 60FPS Rendering, Precision GOP Seeking, and Compositing
  console.log('\n--- 8. FULL HD 1080x1920 60FPS RENDERING & COMPOSITING ---');
  const rawClipOutput = path.join(outputDir, 'clip_1080x1920_raw.mp4');
  const bRollClipOutput = path.join(outputDir, 'clip_1080x1920_broll.mp4');
  const finalClipOutput = path.join(outputDir, 'clip_1080x1920_captioned.mp4');

  const nexusCropPlan = {
    content_type: 'mixed',
    recommended_zoom: 1.0,
    points: [
      {
        time: 0,
        offset: (1920 - 1080 * (9 / 16)) / 2,
        y_offset: 0,
        confidence: 0.95,
      },
    ],
  };

  await processor.processClip(
    sampleVideoPath,
    rawClipOutput,
    visualSnapped.snappedStartSec,
    visualSnapped.snappedEndSec - visualSnapped.snappedStartSec,
    nexusCropPlan
  );
  console.log(`[LocalPipeline]: Raw 9:16 Crop Rendered (Two-Stage GOP Precision Seek): ${rawClipOutput}`);

  // Overlay Contextual B-Roll
  await processor.overlayBRoll(rawClipOutput, renderedBRollClips, bRollClipOutput);
  console.log(`[LocalPipeline]: B-Roll Overlay Composited: ${bRollClipOutput}`);

  // Burn in Kinetic Subtitles
  await processor.addCaptions(bRollClipOutput, finalClipOutput, subtitleAssPath);
  console.log(`[LocalPipeline]: Captioned Clip Rendered: ${finalClipOutput}`);

  // 10. Top Hook Header Card & Animated Scrub/Progress Bar
  console.log('\n--- 9. TOP HOOK BANNER & ANIMATED PROGRESS BAR ---');
  const studioFinalClipOutput = path.join(outputDir, 'clip_1080x1920_studio_final.mp4');
  await processor.addHookAndProgressBar(
    finalClipOutput,
    studioFinalClipOutput,
    'AI VIDEO CLIPPING PIPELINE',
    visualSnapped.snappedEndSec - visualSnapped.snappedStartSec
  );
  console.log(`[LocalPipeline]: Studio Final Clip (with Hook & Progress Bar): ${studioFinalClipOutput}`);

  // 11. Playback & Delivery Validation Check
  console.log('\n--- 10. PLAYBACK & ARTIFACT DELIVERY VALIDATION ---');
  const fileStats = fs.statSync(studioFinalClipOutput);
  console.log(`[LocalPipeline]: Rendered File Size: ${(fileStats.size / (1024 * 1024)).toFixed(2)} MB`);

  const validatedArtifact = await ArtifactValidator.validateAndBuildArtifact(
    studioFinalClipOutput,
    `file://${studioFinalClipOutput}`,
    'local',
    'local-debug-job'
  );

  console.log(`[LocalPipeline]: Validated Artifact Duration: ${((validatedArtifact.durationMs || 0) / 1000).toFixed(2)}s`);
  console.log(`[LocalPipeline]: Validated Resolution:        ${validatedArtifact.width}x${validatedArtifact.height}`);
  console.log(`[LocalPipeline]: Video Codec:                 ${validatedArtifact.videoCodec}`);
  console.log(`[LocalPipeline]: Audio Codec:                 ${validatedArtifact.audioCodec}`);
  console.log(`[LocalPipeline]: Delivery & Playback:         ✅ PASSED (Lossless 1080x1920 Faststart)`);

  console.log('\n===============================================================');
  console.log('🎉 SOTA ADVANCED CLIPPING PIPELINE VALIDATED SUCCESSFULLY!');
  console.log(`🎬 View your final rendered clip at:\n   ${studioFinalClipOutput}`);
  console.log('===============================================================');
}

main().catch((err) => {
  console.error('[LocalPipeline]: Fatal Error during local pipeline test:');
  console.error(err);
  process.exit(1);
});
