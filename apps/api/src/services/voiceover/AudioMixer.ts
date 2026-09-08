import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { VoiceoverPlan, VoiceoverSegment } from './VoiceoverPlan';
import { VoiceoverService, VoiceConfig } from '../VoiceoverService';
import { getBinaryPath } from '../videoProcessor';
import { KineticCaptionGenerator } from '../kineticCaptionGenerator';

export interface MixedAudioResult {
  outputVideoPath: string;
  outputAudioPath: string;
  captionPath?: string;
  segmentAudios: Array<{
    id: string;
    audioPath: string;
    durationMs: number;
    startTime: number;
    endTime: number;
  }>;
  finalDuration: number;
}

export class AudioMixer {
  private static instance: AudioMixer;
  private voiceoverService = VoiceoverService.getInstance();

  static getInstance(): AudioMixer {
    if (!AudioMixer.instance) {
      AudioMixer.instance = new AudioMixer();
    }
    return AudioMixer.instance;
  }

  private runCommand(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(bin, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Command failed: ${bin} ${args.join(' ')}\n${stderr || err.message}`));
        } else {
          resolve(stdout + '\n' + stderr);
        }
      });
    });
  }

  private async getDuration(filePath: string): Promise<number> {
    const ffprobeBin = getBinaryPath('ffprobe');
    return new Promise((resolve) => {
      execFile(ffprobeBin, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ], (err, stdout) => {
        if (err || !stdout) resolve(0);
        else {
          const parsed = parseFloat(stdout.trim());
          resolve(isNaN(parsed) ? 0 : parsed);
        }
      });
    });
  }

  private async hasAudioStream(videoPath: string): Promise<boolean> {
    const ffprobeBin = getBinaryPath('ffprobe');
    return new Promise((resolve) => {
      execFile(ffprobeBin, [
        '-v', 'error',
        '-select_streams', 'a:0',
        '-show_entries', 'stream=codec_type',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoPath
      ], (err, stdout) => {
        if (err || !stdout) resolve(false);
        else resolve(stdout.trim().toLowerCase() === 'audio');
      });
    });
  }

  /**
   * Executes the full VoiceoverPlan:
   * 1. Synthesizes each timeline segment with disk-caching.
   * 2. Places segments at precise timeline offsets.
   * 3. Intelligent sidechain ducking of original video audio.
   * 4. EBU R128 mastering, anti-pop fades, and highpass rumble filter.
   * 5. Merges into final video with explicit target duration (no -shortest truncation).
   */
  async executePlan(
    plan: VoiceoverPlan,
    inputVideoPath: string,
    workDir: string
  ): Promise<MixedAudioResult> {
    const ffmpegBin = getBinaryPath('ffmpeg');
    if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

    const segments = plan.timeline.segments;
    if (segments.length === 0) {
      throw new Error('VoiceoverPlan must contain at least one timeline segment.');
    }

    // Step 1: Synthesize all segments
    const segmentAudios: Array<{
      id: string;
      audioPath: string;
      durationMs: number;
      startTime: number;
      endTime: number;
    }> = [];

    const segmentsDir = path.join(workDir, 'segments');
    if (!fs.existsSync(segmentsDir)) fs.mkdirSync(segmentsDir, { recursive: true });

    for (const [idx, seg] of segments.entries()) {
      const config: VoiceConfig = {
        provider: seg.provider,
        voiceId: seg.voice,
        speakingRate: seg.speakingRate,
        pitch: seg.pitch,
        volumeGainDb: seg.volumeGainDb,
        excitement: seg.excitement,
        energy: seg.energy,
        drama: seg.drama,
      };

      console.log(`[AudioMixer]: Synthesizing segment #${idx + 1} (${seg.id}) at t=${seg.startTime}s`);
      const result = await this.voiceoverService.synthesize(
        seg.text,
        config,
        segmentsDir,
        seg.id
      );

      const actualDurationSec = await this.getDuration(result.audioPath);
      const durationMs = Math.round(actualDurationSec * 1000);

      segmentAudios.push({
        id: seg.id,
        audioPath: result.audioPath,
        durationMs,
        startTime: seg.startTime,
        endTime: seg.startTime + actualDurationSec,
      });
    }

    // Step 2: Assemble Timed Voiceover Master Track
    const assembledVoAudioPath = path.join(workDir, 'assembled_voiceover.wav');
    const targetDuration = plan.targetDuration;

    // Build FFmpeg command to assemble all segments with adelay onto silent base
    // Input 0 is silent base of exact targetDuration
    const assembleArgs: string[] = [
      '-y',
      '-f', 'lavfi',
      '-i', `anullsrc=channel_layout=stereo:sample_rate=48000:d=${targetDuration}`,
    ];

    for (const item of segmentAudios) {
      assembleArgs.push('-i', item.audioPath);
    }

    const filterChains: string[] = [];
    const mixInputs: string[] = ['[0:a]'];

    for (let i = 0; i < segmentAudios.length; i++) {
      const item = segmentAudios[i];
      const delayMs = Math.max(0, Math.round(item.startTime * 1000));
      const inputIdx = i + 1;
      filterChains.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs},aresample=48000[delayed_${i}]`);
      mixInputs.push(`[delayed_${i}]`);
    }

    filterChains.push(
      `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0:normalize=0[vo_mix]`
    );

    assembleArgs.push(
      '-filter_complex', filterChains.join(';'),
      '-map', '[vo_mix]',
      '-c:a', 'pcm_s16le',
      '-t', String(targetDuration),
      assembledVoAudioPath
    );

    console.log(`[AudioMixer]: Assembling ${segmentAudios.length} timeline segment(s) onto master timeline...`);
    await this.runCommand(ffmpegBin, assembleArgs);

    // Step 3: Mixing & Sidechain Ducking with Original Video Audio
    const masteredAudioPath = path.join(workDir, 'mastered_audio.wav');
    const hasOriginalAudio = await this.hasAudioStream(inputVideoPath);

    const fadeDuration = 0.05;
    const fadeStart = Math.max(0, targetDuration - fadeDuration);
    const masteringFilter = [
      'highpass=f=80',
      `afade=t=in:st=0:d=${fadeDuration}`,
      `afade=t=out:st=${fadeStart.toFixed(2)}:d=${fadeDuration}`,
      'loudnorm=I=-16:TP=-1.5:LRA=11'
    ].join(',');

    if (!hasOriginalAudio || plan.originalAudioPolicy === 'mute') {
      console.log(`[AudioMixer]: Using voiceover-only audio policy (${plan.originalAudioPolicy || 'no original audio'}).`);
      await this.runCommand(ffmpegBin, [
        '-y',
        '-i', assembledVoAudioPath,
        '-af', masteringFilter,
        '-c:a', 'pcm_s16le',
        '-t', String(targetDuration),
        masteredAudioPath
      ]);
    } else {
      // Intelligent Sidechain Ducking
      console.log(`[AudioMixer]: Applying sidechain ducking to original video audio track...`);
      const duckThreshold = 0.08;
      const duckRatio = 4.0;
      const attack = plan.duckingPolicy?.attackMs ?? 25;
      const release = plan.duckingPolicy?.releaseMs ?? 250;

      // [0:a] is original video audio, [1:a] is assembled voiceover track
      const duckingFilterGraph = [
        `[0:a][1:a]sidechaincompress=threshold=${duckThreshold}:ratio=${duckRatio}:attack=${attack}:release=${release}[ducked_bg]`,
        `[ducked_bg][1:a]amix=inputs=2:duration=first:weights=0.8 1.2:dropout_transition=0,${masteringFilter}[master_out]`
      ].join(';');

      await this.runCommand(ffmpegBin, [
        '-y',
        '-i', inputVideoPath,
        '-i', assembledVoAudioPath,
        '-filter_complex', duckingFilterGraph,
        '-map', '[master_out]',
        '-c:a', 'pcm_s16le',
        '-t', String(targetDuration),
        masteredAudioPath
      ]);
    }

    // Step 4: Final Video Assembly with EXPLICIT Target Duration and Optional Kinetic Captions
    let captionPath: string | undefined;
    const shouldBurnCaptions = Boolean(plan.captions?.enabled && plan.captions?.burn !== false);

    if (plan.captions?.enabled) {
      const allWords: Array<{ start: number; end: number; word: string }> = [];
      for (const item of segmentAudios) {
        const seg = segments.find(s => s.id === item.id);
        if (!seg) continue;
        // Strip SSML tags to obtain clean spoken words for subtitles
        const cleanText = seg.text.replace(/<[^>]*>/g, '').trim();
        const rawWords = cleanText.split(/\s+/).filter(w => w.length > 0);
        if (rawWords.length === 0) continue;

        const segDurationSec = item.durationMs / 1000;
        const totalChars = rawWords.reduce((sum, w) => sum + Math.max(1, w.length), 0);
        let curTime = item.startTime;

        for (const w of rawWords) {
          const wLen = Math.max(1, w.length);
          const wDuration = Math.max(0.1, (wLen / totalChars) * segDurationSec);
          allWords.push({
            start: Number(curTime.toFixed(3)),
            end: Number((curTime + wDuration).toFixed(3)),
            word: w,
          });
          curTime += wDuration;
        }
      }

      if (allWords.length > 0) {
        captionPath = path.join(workDir, 'captions.ass');
        const captionGen = new KineticCaptionGenerator();
        captionGen.generateASS(allWords, captionPath, plan.captions.preset || 'submagic');
        console.log(`[AudioMixer]: Generated ${allWords.length} kinetic caption words (preset: ${plan.captions.preset || 'submagic'}) -> ${captionPath}`);
      }
    }

    const outputVideoPath = path.join(workDir, 'final_voiceover.mp4');
    console.log(`[AudioMixer]: Multiplexing final video with explicit target duration: ${targetDuration}s (No -shortest)...`);

    if (shouldBurnCaptions && captionPath && fs.existsSync(captionPath)) {
      console.log(`[AudioMixer]: Burning kinetic ASS captions directly into final video track...`);
      const safeAssPath = path.resolve(captionPath).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\\\'");
      await this.runCommand(ffmpegBin, [
        '-y',
        '-i', inputVideoPath,
        '-i', masteredAudioPath,
        '-vf', `ass='${safeAssPath}'`,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '19',
        '-pix_fmt', 'yuv420p',
        '-map', '0:v',
        '-map', '1:a',
        '-c:a', plan.outputFormat.audioCodec || 'aac',
        '-b:a', plan.outputFormat.audioBitrate || '192k',
        '-t', String(targetDuration),
        '-movflags', '+faststart',
        outputVideoPath
      ]);
    } else {
      await this.runCommand(ffmpegBin, [
        '-y',
        '-i', inputVideoPath,
        '-i', masteredAudioPath,
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'copy',
        '-c:a', plan.outputFormat.audioCodec || 'aac',
        '-b:a', plan.outputFormat.audioBitrate || '192k',
        '-t', String(targetDuration),
        '-movflags', '+faststart',
        outputVideoPath
      ]);
    }

    const finalDuration = await this.getDuration(outputVideoPath);

    return {
      outputVideoPath,
      outputAudioPath: masteredAudioPath,
      captionPath,
      segmentAudios,
      finalDuration,
    };
  }
}
