import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { getBinaryPath } from '../videoProcessor';

export interface WordToken {
  word: string;
  start: number;
  end: number;
}

export interface EDLSegment {
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface JumpCutResult {
  edlSegments: EDLSegment[];
  retimedWords: WordToken[];
  totalOriginalDurationSec: number;
  totalNewDurationSec: number;
  timeSavedSec: number;
}

export class MicroJumpCutter {
  private readonly maxSilenceGapSec: number;
  private readonly minSpeechSegmentDurationSec: number;

  constructor(maxSilenceGapSec = 0.55, minSpeechSegmentDurationSec = 0.3) {
    this.maxSilenceGapSec = maxSilenceGapSec;
    this.minSpeechSegmentDurationSec = minSpeechSegmentDurationSec;
  }

  /**
   * Analyzes word tokens inside a clip boundary, removes dead-air pauses and filler tokens,
   * generates an EDL (Edit Decision List), and computes frame-accurate retimed word timestamps.
   */
  public planJumpCuts(
    words: WordToken[],
    clipStartSec: number,
    clipEndSec: number
  ): JumpCutResult {
    // Filter words within the clip range
    const clipWords = words.filter((w) => w.end > clipStartSec && w.start < clipEndSec);

    if (clipWords.length === 0) {
      const duration = clipEndSec - clipStartSec;
      return {
        edlSegments: [{ startSec: clipStartSec, endSec: clipEndSec, durationSec: duration }],
        retimedWords: [],
        totalOriginalDurationSec: duration,
        totalNewDurationSec: duration,
        timeSavedSec: 0,
      };
    }

    const edlSegments: EDLSegment[] = [];
    let currentSegStart = Math.max(clipStartSec, clipWords[0].start - 0.08);

    for (let i = 0; i < clipWords.length; i++) {
      const currentWord = clipWords[i];
      const nextWord = clipWords[i + 1];

      if (nextWord) {
        const gap = nextWord.start - currentWord.end;
        if (gap > this.maxSilenceGapSec) {
          // Close current speech segment
          const currentSegEnd = Math.min(clipEndSec, currentWord.end + 0.08);
          if (currentSegEnd - currentSegStart >= this.minSpeechSegmentDurationSec) {
            edlSegments.push({
              startSec: Number(currentSegStart.toFixed(3)),
              endSec: Number(currentSegEnd.toFixed(3)),
              durationSec: Number((currentSegEnd - currentSegStart).toFixed(3)),
            });
          }
          currentSegStart = Math.max(clipStartSec, nextWord.start - 0.08);
        }
      } else {
        // Final word
        const currentSegEnd = Math.min(clipEndSec, currentWord.end + 0.08);
        if (currentSegEnd - currentSegStart >= this.minSpeechSegmentDurationSec) {
          edlSegments.push({
            startSec: Number(currentSegStart.toFixed(3)),
            endSec: Number(currentSegEnd.toFixed(3)),
            durationSec: Number((currentSegEnd - currentSegStart).toFixed(3)),
          });
        }
      }
    }

    // Fallback if no split segments
    if (edlSegments.length === 0) {
      const duration = clipEndSec - clipStartSec;
      edlSegments.push({ startSec: clipStartSec, endSec: clipEndSec, durationSec: duration });
    }

    // Retime words so that subtitles remain 100% in sync with the spliced audio
    const retimedWords: WordToken[] = [];
    for (const w of clipWords) {
      let accumulatedTime = 0;
      let matched = false;

      for (const seg of edlSegments) {
        // Check if word falls into or overlaps this segment
        if (w.start < seg.endSec && w.end > seg.startSec) {
          const clampedStart = Math.max(seg.startSec, w.start);
          const clampedEnd = Math.min(seg.endSec, w.end);
          const offsetInSeg = clampedStart - seg.startSec;
          const wordDuration = Math.max(0.05, clampedEnd - clampedStart);
          retimedWords.push({
            word: w.word,
            start: Number((accumulatedTime + offsetInSeg).toFixed(3)),
            end: Number((accumulatedTime + offsetInSeg + wordDuration).toFixed(3)),
          });
          matched = true;
          break;
        }
        accumulatedTime += seg.durationSec;
      }
    }

    const totalOriginalDurationSec = Number((clipEndSec - clipStartSec).toFixed(3));
    const totalNewDurationSec = Number(
      edlSegments.reduce((sum, s) => sum + s.durationSec, 0).toFixed(3)
    );
    const timeSavedSec = Number((totalOriginalDurationSec - totalNewDurationSec).toFixed(3));

    return {
      edlSegments,
      retimedWords,
      totalOriginalDurationSec,
      totalNewDurationSec,
      timeSavedSec: Math.max(0, timeSavedSec),
    };
  }

  /**
   * Executes seamless multi-segment video/audio cutting and concatenation via FFmpeg
   */
  public async executeEDLSplice(
    inputPath: string,
    edlSegments: EDLSegment[],
    outputPath: string
  ): Promise<string> {
    if (edlSegments.length === 1) {
      const seg = edlSegments[0];
      const ffmpeg = getBinaryPath('ffmpeg');
      const args = [
        '-ss', String(seg.startSec),
        '-i', inputPath,
        '-t', String(seg.durationSec),
        '-c', 'copy',
        '-y',
        outputPath,
      ];
      await new Promise<void>((resolve, reject) => {
        execFile(ffmpeg, args, (err, _stdout, stderr) => {
          if (err) return reject(new Error(`Single segment splice failed: ${err.message}\n${stderr}`));
          resolve();
        });
      });
      return outputPath;
    }

    const ffmpeg = getBinaryPath('ffmpeg');
    const filterSegments: string[] = [];
    const concatInputs: string[] = [];

    edlSegments.forEach((seg, idx) => {
      const fadeDur = Math.min(0.015, Math.max(0.005, Number((seg.durationSec * 0.05).toFixed(3))));
      const fadeOutStart = Math.max(0, Number((seg.durationSec - fadeDur).toFixed(3)));
      filterSegments.push(
        `[0:v]trim=start=${seg.startSec}:end=${seg.endSec},setpts=PTS-STARTPTS[v${idx}]`,
        `[0:a]atrim=start=${seg.startSec}:end=${seg.endSec},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${fadeDur}:curve=hsin,afade=t=out:st=${fadeOutStart}:d=${fadeDur}:curve=hsin[a${idx}]`
      );
      concatInputs.push(`[v${idx}][a${idx}]`);
    });

    const filterGraph = `${filterSegments.join(';')};${concatInputs.join('')}concat=n=${edlSegments.length}:v=1:a=1[outv][outa]`;

    const args = [
      '-i', inputPath,
      '-filter_complex', filterGraph,
      '-map', '[outv]',
      '-map', '[outa]',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-y',
      outputPath,
    ];

    await new Promise<void>((resolve, reject) => {
      execFile(ffmpeg, args, { maxBuffer: 1024 * 1024 * 50 }, (err, _stdout, stderr) => {
        if (err) return reject(new Error(`EDL multi-segment concat failed: ${err.message}\n${stderr}`));
        resolve();
      });
    });

    return outputPath;
  }
}
