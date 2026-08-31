import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { getBinaryPath } from '../videoProcessor';

export interface BRollMoment {
  id: string;
  startSec: number;
  durationSec: number;
  keyword: string;
  visualPrompt: string;
  style: 'cinematic' | 'motion_graphic' | 'cyber_matrix' | 'neon_glow';
  layout: 'full_cutaway' | 'picture_in_picture_top' | 'picture_in_picture_center';
}

export interface RenderedBRollSegment {
  moment: BRollMoment;
  videoPath: string;
}

export class GenerativeVisualEngine {
  /**
   * Identifies candidate moments from transcript words that benefit from contextual B-roll overlays
   */
  public planBRollMoments(
    words: Array<{ word: string; start: number; end: number }>,
    clipStartSec: number,
    clipEndSec: number
  ): BRollMoment[] {
    const relativeWords = words
      .filter((w) => w.end >= clipStartSec && w.start <= clipEndSec)
      .map((w) => ({
        word: w.word.toLowerCase().replace(/[^a-z0-9]/g, ''),
        start: Math.max(0, w.start - clipStartSec),
        end: Math.max(0, w.end - clipStartSec),
      }));

    const keyTopics: Record<string, { prompt: string; style: BRollMoment['style']; layout: BRollMoment['layout'] }> = {
      ai: {
        prompt: 'Futuristic AI neural network glowing nodes and pulsing synapses',
        style: 'cyber_matrix',
        layout: 'picture_in_picture_top',
      },
      generation: {
        prompt: 'Dynamic technological wave expanding into futuristic cyber grid',
        style: 'neon_glow',
        layout: 'picture_in_picture_center',
      },
      viral: {
        prompt: 'Exponential virality engagement graph exploding with colorful particle sparks',
        style: 'motion_graphic',
        layout: 'full_cutaway',
      },
      video: {
        prompt: 'Sleek holographic film reels and digital camera motion blur',
        style: 'cinematic',
        layout: 'picture_in_picture_top',
      },
      future: {
        prompt: 'Neon sci-fi cityscape with hyperdrive streaks',
        style: 'cyber_matrix',
        layout: 'full_cutaway',
      },
    };

    const planned: BRollMoment[] = [];
    let lastMomentEnd = 0;

    for (const item of relativeWords) {
      if (keyTopics[item.word] && item.start >= lastMomentEnd + 2.0) {
        const config = keyTopics[item.word];
        const durationSec = 3.0; // 3 second dynamic visual overlay
        planned.push({
          id: `broll_${Math.round(item.start * 1000)}`,
          startSec: Number(item.start.toFixed(2)),
          durationSec,
          keyword: item.word,
          visualPrompt: config.prompt,
          style: config.style,
          layout: config.layout,
        });
        lastMomentEnd = item.start + durationSec;
      }
    }

    return planned;
  }

  /**
   * Synthesizes procedural or AI-generated visual B-roll clip locally using FFmpeg motion graphics
   */
  public async generateLocalBRollClip(moment: BRollMoment, outputDir: string): Promise<string> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(outputDir, `${moment.id}_${moment.keyword}.mp4`);
    if (fs.existsSync(outputFile)) {
      return outputFile;
    }

    const ffmpeg = getBinaryPath('ffmpeg');

    // Check for standard Windows font
    const fontPath = 'C\\:/Windows/Fonts/arial.ttf';
    const fontOption = fs.existsSync('C:/Windows/Fonts/arial.ttf') ? `:fontfile='${fontPath}'` : '';

    // Generate procedural motion graphics based on style
    let filterGraph = '';
    if (moment.style === 'cyber_matrix') {
      filterGraph =
        'testsrc2=size=1080x720:rate=30,drawgrid=w=60:h=60:t=2:c=cyan@0.6,' +
        `drawtext=text='AI // ${moment.keyword.toUpperCase()}'${fontOption}:fontsize=54:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.7:boxborderw=10`;
    } else if (moment.style === 'neon_glow') {
      filterGraph =
        'mandelbrot=size=1080x720:rate=30:maxiter=120,hue=s=2:H=2*PI*t/10,' +
        `drawtext=text='${moment.keyword.toUpperCase()}'${fontOption}:fontsize=64:fontcolor=yellow:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.6:boxborderw=12`;
    } else {
      filterGraph =
        'cellauto=size=1080x720:rate=30:rule=30,colorchannelmixer=rr=0.8:gg=0.2:bb=0.9,' +
        `drawtext=text='VIRAL HOOK'${fontOption}:fontsize=60:fontcolor=orange:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.8:boxborderw=15`;
    }

    const args = [
      '-f', 'lavfi',
      '-i', filterGraph,
      '-t', String(moment.durationSec),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-y',
      outputFile,
    ];

    await new Promise<void>((resolve, reject) => {
      execFile(ffmpeg, args, (err, _stdout, stderr) => {
        if (err) {
          return reject(new Error(`Failed to synthesize B-roll clip: ${err.message}\n${stderr}`));
        }
        resolve();
      });
    });

    return outputFile;
  }
}
