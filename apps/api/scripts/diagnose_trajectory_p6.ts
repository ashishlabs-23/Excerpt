import fs from 'fs';
import path from 'path';
import {
  SmartReframeEngine,
  PerceptionFrame,
  MediaArtifact,
  DirectorConfig,
  CameraCropBox,
} from '@excerpt/clipping-core';

interface TrajectoryPoint {
  index: number;
  timestampSec: number;
  dtSec: number;
  faceY: number;
  facePxY: number;
  faceBottomPx: number;
  idealY: number;
  yMinSubtitle: number;
  yMaxHeadroom: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  deltaX: number;
  deltaY: number;
  cropVelocityXPxSec: number;
  cropVelocityYPxSec: number;
  cropAccelYPxSec2: number;
  cameraMode: string;
  cameraMotionState: string;
  inSubtitleZoneRaw: boolean;
  inSubtitleZoneCropped: boolean;
}

function getInterpolatedCrop(keyframes: any[], timestampMs: number, targetW: number, targetH: number) {
  if (!keyframes || keyframes.length === 0) {
    return { x: 0, y: 0, w: targetW, h: targetH };
  }
  if (keyframes.length === 1 || timestampMs <= keyframes[0].timestampMs) {
    return { ...keyframes[0].cropBox };
  }
  if (timestampMs >= keyframes[keyframes.length - 1].timestampMs) {
    return { ...keyframes[keyframes.length - 1].cropBox };
  }

  for (let i = 0; i < keyframes.length - 1; i++) {
    const kfA = keyframes[i];
    const kfB = keyframes[i + 1];
    if (timestampMs >= kfA.timestampMs && timestampMs <= kfB.timestampMs) {
      const span = kfB.timestampMs - kfA.timestampMs;
      if (span <= 0) return { ...kfA.cropBox };
      const alpha = (timestampMs - kfA.timestampMs) / span;
      return {
        x: kfA.cropBox.x + (kfB.cropBox.x - kfA.cropBox.x) * alpha,
        y: kfA.cropBox.y + (kfB.cropBox.y - kfA.cropBox.y) * alpha,
        w: kfA.cropBox.w + (kfB.cropBox.w - kfA.cropBox.w) * alpha,
        h: kfA.cropBox.h + (kfB.cropBox.h - kfA.cropBox.h) * alpha,
      };
    }
  }

  return { ...keyframes[keyframes.length - 1].cropBox };
}

function runTrajectoryDiagnostics() {
  const W = 1920;
  const H = 1080;

  const realTrajectory = [
    { t: 0.00, x: 0.500, y: 0.500, conf: 0.95 },
    { t: 0.25, x: 0.495, y: 0.520, conf: 0.95 },
    { t: 0.50, x: 0.492, y: 0.540, conf: 0.94 },
    { t: 0.75, x: 0.490, y: 0.570, conf: 0.94 },
    { t: 1.00, x: 0.488, y: 0.610, conf: 0.92 },
    { t: 1.25, x: 0.485, y: 0.650, conf: 0.91 },
    { t: 1.50, x: 0.483, y: 0.700, conf: 0.90 },
    { t: 1.75, x: 0.482, y: 0.740, conf: 0.88 },
    { t: 2.00, x: 0.481, y: 0.770, conf: 0.86 },
    { t: 2.25, x: 0.480, y: 0.795, conf: 0.85 },
    { t: 2.50, x: 0.4804, y: 0.8143, conf: 0.85 },
    { t: 2.75, x: 0.4805, y: 0.8140, conf: 0.84 },
    { t: 3.00, x: 0.4810, y: 0.8120, conf: 0.84 },
    { t: 3.25, x: 0.4820, y: 0.8050, conf: 0.86 },
    { t: 3.50, x: 0.4830, y: 0.7850, conf: 0.88 },
    { t: 3.75, x: 0.4850, y: 0.7500, conf: 0.90 },
    { t: 4.00, x: 0.4880, y: 0.7100, conf: 0.92 },
    { t: 4.25, x: 0.4900, y: 0.6700, conf: 0.93 },
    { t: 4.50, x: 0.4930, y: 0.6200, conf: 0.94 },
    { t: 4.75, x: 0.4960, y: 0.5800, conf: 0.95 },
    { t: 5.00, x: 0.5000, y: 0.5200, conf: 0.95 },
    { t: 5.25, x: 0.5020, y: 0.4900, conf: 0.95 },
    { t: 5.50, x: 0.5050, y: 0.4600, conf: 0.95 },
    { t: 5.75, x: 0.5070, y: 0.4300, conf: 0.95 },
    { t: 6.00, x: 0.5100, y: 0.4100, conf: 0.95 },
    { t: 6.25, x: 0.5120, y: 0.4000, conf: 0.94 },
    { t: 6.50, x: 0.5140, y: 0.3950, conf: 0.94 },
    { t: 6.75, x: 0.5160, y: 0.3920, conf: 0.93 },
    { t: 7.00, x: 0.5180, y: 0.3900, conf: 0.93 },
    { t: 7.25, x: 0.5200, y: 0.3950, conf: 0.94 },
    { t: 7.50, x: 0.5210, y: 0.4100, conf: 0.94 },
    { t: 7.75, x: 0.5200, y: 0.4300, conf: 0.95 },
    { t: 8.00, x: 0.5180, y: 0.4500, conf: 0.95 },
    { t: 8.25, x: 0.5150, y: 0.4700, conf: 0.95 },
    { t: 8.50, x: 0.5120, y: 0.4900, conf: 0.95 },
    { t: 8.75, x: 0.5080, y: 0.5100, conf: 0.95 },
    { t: 9.00, x: 0.5050, y: 0.5200, conf: 0.95 },
    { t: 9.25, x: 0.5020, y: 0.5150, conf: 0.95 },
    { t: 9.50, x: 0.5000, y: 0.5100, conf: 0.95 },
    { t: 9.75, x: 0.4980, y: 0.5050, conf: 0.95 },
  ];

  const frames: PerceptionFrame[] = realTrajectory.map(pt => ({
    timestampMs: Math.round(pt.t * 1000),
    durationMs: 250,
    transcriptWords: { available: true, data: [] },
    faces: {
      available: true,
      data: [
        { x: pt.x - 0.08, y: pt.y - 0.12, w: 0.16, h: 0.24, confidence: pt.conf, speakerId: 'real_speaker_1' }
      ]
    },
    persons: { available: false, data: [] },
    objects: { available: false, data: [] },
    speaker: { available: true, data: { activeSpeakerId: 'real_speaker_1', confidence: pt.conf } },
    scene: { available: false, data: null },
    motion: { available: false, data: null },
    audioEnergy: { available: false, data: 0 },
    pitch: { available: false, data: 0 },
    emotion: { available: false, data: 'neutral' },
    visualSaliency: { available: false, data: null },
    cameraMotion: { available: true, data: 'static' }
  }));

  const artifact: MediaArtifact = {
    sourceType: 'local',
    originalUrlOrPath: 'test://corpus-07-real-1080p',
    localPath: 'temp/corpus-07-real-1080p.mp4',
    mimeType: 'video/mp4',
    durationMs: 10000,
    width: W,
    height: H,
    fps: 25,
    videoCodec: 'h264',
    hasVideoStream: true,
    hasAudioStream: true,
    hasAudio: true,
    fileSizeBytes: 1024 * 1024 * 10,
    checksumSha256: 'test_hash',
  };

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
    subtitleReserveRatio: 0.22,
    deadbandRatio: 0.03,
    cutThresholdRatio: 0.25,
  };

  const plan = SmartReframeEngine.generatePlan(artifact, frames, directorConfig);
  const keyframes = plan.keyframes;

  const targetW = H * (directorConfig.targetAspectRatio || 9 / 16);
  const targetH = H;
  const subtitleReserveRatio = directorConfig.subtitleReserveRatio ?? 0.22;
  const subtitleThresholdPx = targetH * (1.0 - subtitleReserveRatio); // 842.4 px

  const report: TrajectoryPoint[] = [];

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const crop = getInterpolatedCrop(keyframes, f.timestampMs, targetW, targetH);
    const kf = keyframes.find(k => k.timestampMs === f.timestampMs) || keyframes[Math.min(i, keyframes.length - 1)];
    const tSec = f.timestampMs / 1000;
    const face = f.faces.data![0];
    const facePxY = face.y * H;
    const facePxH = face.h * H;
    const faceBottomPx = facePxY + facePxH;

    const safeTopLimit = targetH * 0.05;
    const yMaxHeadroom = facePxY - safeTopLimit;
    const yMinSubtitle = faceBottomPx - subtitleThresholdPx;
    const eyeLineRatio = 0.33;
    const idealY = (facePxY + facePxH * 0.4) - targetH * eyeLineRatio;

    const prevPt = report[report.length - 1];
    const dtSec = prevPt ? tSec - prevPt.timestampSec : 0.25;
    const deltaX = prevPt ? crop.x - prevPt.cropX : 0;
    const deltaY = prevPt ? crop.y - prevPt.cropY : 0;
    const velX = dtSec > 0 ? deltaX / dtSec : 0;
    const velY = dtSec > 0 ? deltaY / dtSec : 0;
    const accelY = prevPt && dtSec > 0 ? (velY - prevPt.cropVelocityYPxSec) / dtSec : 0;

    const faceBottomInCrop = faceBottomPx - crop.y;

    report.push({
      index: i,
      timestampSec: tSec,
      dtSec,
      faceY: face.y,
      facePxY,
      faceBottomPx,
      idealY,
      yMinSubtitle,
      yMaxHeadroom,
      cropX: crop.x,
      cropY: crop.y,
      cropW: crop.w,
      cropH: crop.h,
      deltaX,
      deltaY,
      cropVelocityXPxSec: velX,
      cropVelocityYPxSec: velY,
      cropAccelYPxSec2: accelY,
      cameraMode: kf.cameraMode || 'UNKNOWN',
      cameraMotionState: (f.cameraMotion?.data as string) || 'static',
      inSubtitleZoneRaw: faceBottomPx > subtitleThresholdPx,
      inSubtitleZoneCropped: faceBottomInCrop > subtitleThresholdPx,
    });
  }

  // Summary statistics
  const deltaYs = report.slice(1).map(r => Math.abs(r.deltaY));
  const velsY = report.slice(1).map(r => Math.abs(r.cropVelocityYPxSec));
  const accelsY = report.slice(2).map(r => Math.abs(r.cropAccelYPxSec2));

  deltaYs.sort((a, b) => a - b);
  velsY.sort((a, b) => a - b);
  accelsY.sort((a, b) => a - b);

  const p50DeltaY = deltaYs[Math.floor(deltaYs.length * 0.5)];
  const p95DeltaY = deltaYs[Math.floor(deltaYs.length * 0.95)];
  const p50VelY = velsY[Math.floor(velsY.length * 0.5)];
  const p95VelY = velsY[Math.floor(velsY.length * 0.95)];
  const p95AccelY = accelsY[Math.floor(accelsY.length * 0.95)];

  const summary = {
    totalFrames: report.length,
    p50DeltaY,
    p95DeltaY,
    p50VelY,
    p95VelY,
    p95AccelY,
    modeDistribution: report.reduce((acc: any, r) => {
      acc[r.cameraMode] = (acc[r.cameraMode] || 0) + 1;
      return acc;
    }, {}),
    subtitleBreachesRaw: report.filter(r => r.inSubtitleZoneRaw).length,
    subtitleBreachesCropped: report.filter(r => r.inSubtitleZoneCropped).length,
  };

  const outputPayload = {
    scenario: 'corpus-07-real-1080p',
    summary,
    trajectory: report,
  };

  const outputPath = path.resolve('temp/p6_framing_trajectory_report.json');
  fs.writeFileSync(outputPath, JSON.stringify(outputPayload, null, 2));

  console.log('================================================================================');
  console.log('           P6.4 TRAJECTORY DIAGNOSTIC REPORT (corpus-07-real-1080p)             ');
  console.log('================================================================================\n');
  console.log(`Frames: ${summary.totalFrames} | dt = 250ms (4 Hz sampling)`);
  console.log(`Raw Subtitle Breaches (y > 0.78): ${summary.subtitleBreachesRaw} / ${summary.totalFrames}`);
  console.log(`Cropped Subtitle Breaches:        ${summary.subtitleBreachesCropped} / ${summary.totalFrames}`);
  console.log(`P50 Δy/frame: ${p50DeltaY.toFixed(2)} px | P95 Δy/frame: ${p95DeltaY.toFixed(2)} px`);
  console.log(`P50 Velocity: ${p50VelY.toFixed(1)} px/s | P95 Velocity: ${p95VelY.toFixed(1)} px/s (Cap: ${directorConfig.maxVelocityPxPerSec} px/s)`);
  console.log(`P95 Accel:    ${p95AccelY.toFixed(1)} px/s²`);
  console.log(`Modes:`, summary.modeDistribution);
  console.log('\n--------------------------------------------------------------------------------');
  console.log('Frame-by-Frame Timeline (Sampled every 250ms):');
  console.log('--------------------------------------------------------------------------------');
  console.log('  t(s) | FaceY  | FaceBottom | SubLimit | yMinReq | yMaxHead |  CropY  | Δy(px) |  VelY(px/s) | Mode  | Status');
  console.log('--------------------------------------------------------------------------------');

  for (const r of report) {
    const rawFlag = r.inSubtitleZoneRaw ? '⚠️ BREACH' : '  SAFE ';
    console.log(
      ` ${r.timestampSec.toFixed(2).padStart(5)}s | ` +
      `${r.faceY.toFixed(3)} | ` +
      `${r.faceBottomPx.toFixed(1).padStart(7)}px | ` +
      `${subtitleThresholdPx.toFixed(1)}px | ` +
      `${r.yMinSubtitle.toFixed(1).padStart(6)}px | ` +
      `${r.yMaxHeadroom.toFixed(1).padStart(6)}px | ` +
      `${r.cropY.toFixed(1).padStart(6)}px | ` +
      `${r.deltaY.toFixed(1).padStart(5)}px | ` +
      `${r.cropVelocityYPxSec.toFixed(1).padStart(8)} | ` +
      `${r.cameraMode.padEnd(5)} | ` +
      `${rawFlag}`
    );
  }

  // ASCII visualization of trajectory
  console.log('\n--------------------------------------------------------------------------------');
  console.log('ASCII Trajectory Plot: FaceBottom (F) vs CropY (C) vs Subtitle Boundary (S = 842px)');
  console.log('--------------------------------------------------------------------------------');
  const chartHeight = 15;
  const minVal = 0;
  const maxVal = 1080;

  for (let row = chartHeight; row >= 0; row--) {
    const valAtRow = minVal + (row / chartHeight) * (maxVal - minVal);
    let line = `${valAtRow.toFixed(0).padStart(4)}px |`;
    for (let col = 0; col < report.length; col++) {
      const pt = report[col];
      const isSub = Math.abs(subtitleThresholdPx - valAtRow) < 35;
      const isFace = Math.abs(pt.faceBottomPx - valAtRow) < 35;
      const isCrop = Math.abs(pt.cropY - valAtRow) < 35;

      if (isFace && isCrop) line += 'X';
      else if (isFace) line += 'F';
      else if (isCrop) line += 'C';
      else if (isSub) line += '-';
      else line += ' ';
    }
    console.log(line);
  }
  console.log('      +' + '-'.repeat(report.length));
  console.log('Time:  0s' + ' '.repeat(Math.floor(report.length / 2) - 3) + '5s' + ' '.repeat(Math.floor(report.length / 2) - 3) + '10s');
  console.log('Legend: F = Face Bottom (in source px) | C = Crop Y offset | - = Subtitle Zone Start (842px)\n');
}

runTrajectoryDiagnostics();
