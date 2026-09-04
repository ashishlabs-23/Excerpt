import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { StageExecutor, ErrorCategory, PipelineError } from '@excerpt/clipping-core';
import { assertSafeRemoteVideoUrl } from './urlSafety';
import { withYtDlpCookies } from '../lib/cookieHelper';

const binaryPathCache = new Map<string, string>();

function findBinaryUnder(rootDir: string, binaryName: string, maxDepth = 3): string | null {
  if (!rootDir || !fs.existsSync(rootDir)) return null;

  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current.dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === binaryName.toLowerCase()) {
        return fullPath;
      }

      if (entry.isDirectory() && current.depth < maxDepth) {
        queue.push({ dir: fullPath, depth: current.depth + 1 });
      }
    }
  }

  return null;
}

function getWindowsBinaryCandidates(name: string): string[] {
  if (process.platform !== 'win32') return [];

  const executable = `${name}.exe`;
  const localAppData = process.env.LOCALAPPDATA || '';
  const userProfile = process.env.USERPROFILE || '';
  const commonCandidates = [
    path.join(localAppData, 'Microsoft', 'WinGet', 'Links', executable),
    path.join(userProfile, 'scoop', 'shims', executable),
    path.join('C:\\ffmpeg', 'bin', executable),
    path.join('C:\\Program Files', 'ffmpeg', 'bin', executable),
    path.join('C:\\Program Files (x86)', 'ffmpeg', 'bin', executable),
  ];

  if (name === 'yt-dlp') {
    commonCandidates.push(
      path.join(
        localAppData,
        'Microsoft',
        'WinGet',
        'Packages',
        'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe',
        executable
      )
    );
  }

  const wingetPackages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  const detected = findBinaryUnder(wingetPackages, executable, 4);
  if (detected) {
    commonCandidates.push(detected);
  }

  return commonCandidates.filter((candidate, index, all) => {
    return all.indexOf(candidate) === index && fs.existsSync(candidate);
  });
}

// Helper to get binary path with Windows fallbacks for local development
export const getBinaryPath = (name: string) => {
  const cached = binaryPathCache.get(name);
  if (cached) return cached;

  const envKey = `${name.toUpperCase().replace(/-/g, '_')}_PATH`;
  const envPath = process.env[envKey];
  if (envPath && fs.existsSync(envPath)) {
    binaryPathCache.set(name, envPath);
    return envPath;
  }

  // Inside Docker, they are in the system path
  if (process.env.NODE_ENV === 'production') return name;
  
  // Local relative fallback for Windows dev
  const relativePath = path.join(__dirname, '..', '..', 'bin', `${name}.exe`);
  if (fs.existsSync(relativePath)) {
    binaryPathCache.set(name, relativePath);
    return relativePath;
  }

  const windowsCandidate = getWindowsBinaryCandidates(name)[0];
  if (windowsCandidate) {
    binaryPathCache.set(name, windowsCandidate);
    return windowsCandidate;
  }

  return name; // Fallback to system PATH
};

const highQualityEncodeArgs = () => {
  const isDraft = process.env.RENDER_MODE === 'draft';
  const hwAccel = process.env.EXCERPT_HW_ACCEL;

  if (hwAccel === 'nvenc') {
    return [
      '-c:v', 'h264_nvenc',
      '-preset', isDraft ? 'p4' : 'p6',
      '-cq', isDraft ? '22' : '19',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '320k',
      '-ar', '48000',
      '-movflags', '+faststart'
    ];
  }

  if (hwAccel === 'videotoolbox') {
    return [
      '-c:v', 'h264_videotoolbox',
      '-b:v', '6M',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '320k',
      '-ar', '48000',
      '-movflags', '+faststart'
    ];
  }

  return [
    '-c:v', 'libx264',
    '-preset', isDraft ? 'fast' : 'medium',
    '-crf', isDraft ? '19' : '17',
    '-maxrate', '12M',
    '-bufsize', '16M',
    '-profile:v', 'high',
    '-level', '4.2',
    '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    '-colorspace', 'bt709',
    '-vsync', 'cfr',
    '-c:a', 'aac',
    '-b:a', '320k',
    '-ar', '48000',
    '-movflags', '+faststart'
  ];
};

interface VideoDimensions {
  width: number;
  height: number;
}

interface ParsedPgmFrame {
  width: number;
  height: number;
  pixels: Uint8Array;
}

interface SmartCropPoint {
  time: number;
  offset: number;
  y_offset: number;
  confidence: number;
}

export interface SmartCropPlan {
  mode: 'center' | 'static' | 'dynamic';
  xExpression: string;
  yExpression: string;
  debug: string;
}


interface UserFacingFailureOptions {
  code: string;
  title: string;
  userMessage: string;
  details?: string;
  actions?: string[];
  technicalDetail?: string;
  retryable?: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const roundEven = (value: number) => {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
};

class UserFacingFailure extends Error {
  code: string;
  title: string;
  details?: string;
  actions: string[];
  technicalDetail?: string;
  retryable: boolean;

  constructor(options: UserFacingFailureOptions) {
    super(options.userMessage);
    this.name = 'UserFacingFailure';
    this.code = options.code;
    this.title = options.title;
    this.details = options.details;
    this.actions = options.actions || [];
    this.technicalDetail = options.technicalDetail;
    this.retryable = options.retryable ?? false;
  }
}

export class VideoProcessor {
  private redactSensitivePaths(rawMessage: string): string {
    const sensitivePaths = [
      process.env.YTDLP_COOKIES_PATH,
      process.env.YTDLP_COOKIES_DIR,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));

    return sensitivePaths.reduce((message, sensitivePath) => (
      message.split(sensitivePath).join('[redacted-cookie-path]')
    ), rawMessage);
  }

  private getYtDlpOptionalArgs(cookiesPath: string | null): string[] {
    const args: string[] = [];
    const browserProfile = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
    const extractorArgs = process.env.YTDLP_EXTRACTOR_ARGS?.trim();
    if (extractorArgs) {
      args.push('--extractor-args', extractorArgs);
    }

    // 1. Explicit Cookies File (Heaviest Weight)
    if (cookiesPath) {
      console.log(`[VideoProcessor]: Using yt-dlp cookies from secure temp file: ${cookiesPath}`);
      args.push('--cookies', cookiesPath);
      return args; // Skip browser extraction if we have a file
    }

    // 2. Explicit Browser Profile (User Configured)
    if (browserProfile) {
      console.log(`[VideoProcessor]: Using focused browser profile -> ${browserProfile}`);
      args.push('--cookies-from-browser', browserProfile);
      return args;
    }

    if (extractorArgs) {
      args.push('--extractor-args', extractorArgs);
    }

    return args;
  }

  private buildYtDlpFailure(rawMessage: string, cookiesPath: string | null): UserFacingFailure {
    const safeMessage = this.redactSensitivePaths(rawMessage);
    const normalized = safeMessage.toLowerCase();
    const cookieFilePresent = Boolean(cookiesPath);
    const hasSessionSupport = cookieFilePresent || Boolean(process.env.YTDLP_COOKIES_FROM_BROWSER?.trim());

    if (
        normalized.includes('http error 429') ||
        normalized.includes('too many requests') ||
        normalized.includes("sign in to confirm you're not a bot") ||
        normalized.includes('--cookies-from-browser') ||
        normalized.includes('unable to download api page')
    ) {
      return new UserFacingFailure({
        code: 'youtube_verification_required',
        title: 'YouTube Verification Required',
        userMessage: hasSessionSupport
            ? 'YouTube blocked this download even with the current session settings.'
            : 'This YouTube video needs a verified session before the server can download it.',
        details:
            'The worker was stopped by a YouTube anti-bot or rate-limit checkpoint before clipping could begin.',
        actions: hasSessionSupport
            ? [
              'Retry the same URL after a short cooldown if YouTube rate limiting persists.',
              'Replace the current cookies file if the YouTube session is expired.',
              'Use direct file upload for the most reliable processing path.',
            ]
            : [
              'Place a valid Netscape-format YouTube cookies file at /app/cookies/youtube.txt or set YTDLP_COOKIES_PATH.',
              'Retry later if YouTube is rate limiting the server IP.',
              'Upload the source video file directly if you already have it locally.',
            ],
        technicalDetail: safeMessage,
        retryable: true,
      });
    }

    if (normalized.includes('private video')) {
      return new UserFacingFailure({
        code: 'youtube_private_video',
        title: 'Private Video',
        userMessage: 'This YouTube URL points to a private video that the server cannot access.',
        details: 'Private or permission-locked videos require an authenticated session with access to the content.',
        actions: [
          'Upload the video file directly if you own it.',
          'Use a video URL that is publicly accessible to the server.',
        ],
        technicalDetail: safeMessage,
      });
    }

    if (normalized.includes('video unavailable')) {
      return new UserFacingFailure({
        code: 'youtube_video_unavailable',
        title: 'Video Unavailable',
        userMessage: 'The source video is unavailable to the server right now.',
        details: 'The video may have been removed, geo-blocked, age-restricted, or temporarily unavailable.',
        actions: [
          'Confirm that the URL still opens normally in a browser.',
          'Upload the source file directly if you have access to it.',
        ],
        technicalDetail: safeMessage,
      });
    }

    return new UserFacingFailure({
      code: 'youtube_download_failed',
      title: 'Source Download Failed',
      userMessage: 'Excerpt could not download the source video from this URL.',
      details: 'The worker could not retrieve a playable media stream from the provided link.',
      actions: [
        'Retry the URL once to rule out a temporary fetch issue.',
        'Upload the video file directly if you already have the source media.',
      ],
      technicalDetail: safeMessage,
      retryable: true,
    });
  }

  private async getVideoDimensions(inputPath: string): Promise<VideoDimensions> {
    const bin = getBinaryPath('ffprobe');
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'csv=p=0:s=x',
        inputPath,
      ];

      execFile(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`ffprobe dimension lookup failed: ${stderr || error.message}`));
          return;
        }

        const [widthText, heightText] = stdout.trim().split('x');
        const width = parseInt(widthText || '', 10);
        const height = parseInt(heightText || '', 10);

        if (!width || !height) {
          reject(new Error(`Invalid ffprobe dimensions: ${stdout}`));
          return;
        }

        resolve({ width, height });
      });
    });
  }

  private smoothCropPoints(points: SmartCropPoint[]): SmartCropPoint[] {
    if (points.length <= 2) {
      return points;
    }

    const windowSize = 5;
    return points.map((point, index) => {
      const start = Math.max(0, index - Math.floor(windowSize / 2));
      const end = Math.min(points.length, index + Math.floor(windowSize / 2) + 1);
      const neighborhood = points.slice(start, end);
      
      const totalWeight = neighborhood.reduce((sum, p) => sum + (p.confidence || 0.1), 0);
      const blendedOffset = neighborhood.reduce((sum, p) => sum + p.offset * (p.confidence || 0.1), 0);
      const blendedYOffset = neighborhood.reduce((sum, p) => sum + p.y_offset * (p.confidence || 0.1), 0);

      return {
        ...point,
        offset: Number((blendedOffset / Math.max(0.001, totalWeight)).toFixed(4)),
        y_offset: Number((blendedYOffset / Math.max(0.001, totalWeight)).toFixed(4)),
      };
    });
  }

  private compressCropPoints(points: SmartCropPoint[], maxPoints = 8): SmartCropPoint[] {
    if (points.length <= 1) {
      return points;
    }

    const compressed: SmartCropPoint[] = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
      const previous = compressed[compressed.length - 1];
      const current = points[i];
      if (Math.abs(current.offset - previous.offset) >= 0.045 && current.time - previous.time >= 1.4) {
        compressed.push(current);
      }
    }
    compressed.push(points[points.length - 1]);

    if (compressed.length <= maxPoints) {
      return compressed;
    }

    return Array.from({ length: maxPoints }, (_, index) => {
      const sourceIndex = Math.round((index * (compressed.length - 1)) / Math.max(1, maxPoints - 1));
      return compressed[sourceIndex];
    });
  }



  private buildCropExpression(points: SmartCropPoint[], maxOffset: number, maxVOffset: number): SmartCropPlan {
    if (points.length === 0) {
      return {
        mode: 'center',
        xExpression: (maxOffset * 0.35).toFixed(2),
        yExpression: (maxVOffset * 0.25).toFixed(2),
        debug: 'rule-of-thirds fallback (no points)',
      };
    }

    const buildSegmentedExpression = (vals: number[], times: number[]) => {
      let expression = vals[vals.length - 1].toFixed(2);
      for (let index = vals.length - 2; index >= 0; index--) {
        const leftVal = vals[index];
        const rightVal = vals[index + 1];
        const leftTime = Number(times[index].toFixed(3));
        const rightTime = Number(times[index + 1].toFixed(3));
        const timeDelta = Math.max(0.001, rightTime - leftTime);
        
        const tNorm = `(t-${leftTime.toFixed(3)})/${timeDelta.toFixed(3)}`;
        // HERMITE SMOOTHSTEP: 3u^2 - 2u^3
        const u = `(3*pow(${tNorm},2)-2*pow(${tNorm},3))`;
        
        const segmentExpression =
          Math.abs(rightVal - leftVal) < 1
            ? leftVal.toFixed(2)
            : `${leftVal.toFixed(2)}+(${(rightVal - leftVal).toFixed(2)})*${u}`;

        expression = `if(lt(t,${rightTime.toFixed(3)}),${segmentExpression},${expression})`;
      }
      return expression;
    };

    const xOffsets = points.map((p) => clamp(p.offset * maxOffset, 0, maxOffset));
    // EYE-LINE BIAS: Map vertical offset to center eyes (approx) at 33% of crop height
    // Using `cropHeight` + maxVOffset conceptually. 
    // face_y in scaled units = p.yOffset * (1920 + maxVOffset)
    // crop_y = face_y - (1920 * 0.42) // 42% because face center is below eye line
    const yOffsets = points.map((p) => {
      const scaledHeight = 1920 + maxVOffset;
      const faceY = p.y_offset * scaledHeight;
      const idealY = faceY - 1920 * 0.42;
      return clamp(idealY, 0, maxVOffset);
    });

    const times = points.map(p => p.time);

    return {
      mode: 'dynamic',
      xExpression: buildSegmentedExpression(xOffsets, times),
      yExpression: buildSegmentedExpression(yOffsets, times),
      debug: `cinematic 2D crop across ${points.length} neural anchors`,
    };
  }


  /**
   * Generates a stable unique hash for a URL to use as a cache directory.
   */
  getCacheKey(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
  }

  /**
   * Downloads a video from YouTube using yt-dlp via Download Intelligence Engine.
   */
  async downloadVideo(url: string, outputPath: string, onProgress?: (percent: number, speed?: string, eta?: string, strategy?: string) => void): Promise<{ outputPath: string; attempts: any[] }> {
    const { downloadEngine } = require('./download');
    return downloadEngine.executeDownload(url, outputPath, onProgress || (() => {}));
  }

  /**
   * Extracts audio from a video file.
   */
  async extractAudio(inputPath: string, outputPath: string): Promise<string> {
    return StageExecutor.run({ inputPath, outputPath }, {
      stage: 'audio_extraction',
      component: 'VideoProcessor',
      provider: 'FFmpeg',
      timeoutMs: 1000 * 60 * 5, // 5 minute hard timeout
      timeoutType: 'process_timeout',
      validateInput: ({ inputPath }) => fs.existsSync(inputPath),
      execute: async ({ inputPath, outputPath }) => {
        const bin = getBinaryPath('ffmpeg');
        return new Promise<string>((resolve, reject) => {
          console.log(`[VideoProcessor]: Extracting audio with ${bin} -> ${outputPath}`);
          const args = [
            '-i', inputPath,
            '-vn',
            '-acodec', 'libmp3lame',
            '-ab', '64k',
            '-ar', '16000',
            '-ac', '1',
            '-y',
            outputPath
          ];

          execFile(bin, args, { maxBuffer: 1024 * 1024 * 500 }, (error, stdout, stderr) => {
            if (error) {
              console.error('[VideoProcessor]: ffmpeg audio extraction error:', stderr);
              reject(new PipelineError({
                message: `ffmpeg audio extraction failed: ${error.message}`,
                category: ErrorCategory.FFMPEG,
                stage: 'audio_extraction',
                component: 'VideoProcessor',
                provider: 'FFmpeg',
                exitCode: error.code ? Number(error.code) : undefined,
                rootCause: stderr || error.message,
              }));
              return;
            }
            console.log('[VideoProcessor]: Audio extraction complete');
            resolve(outputPath);
          });
        });
      },
      validateOutput: (outPath) => fs.existsSync(outPath) && fs.statSync(outPath).size > 0,
    });
  }

  /**
   * Cuts a video segment and applies 9:16 cropping, with optional single-pass subtitle burn-in.
   */
  async processClip(inputPath: string, outputPath: string, start: number, duration: number, nexusCropPlan?: any, subtitlePath?: string): Promise<string> {
    return StageExecutor.run({ inputPath, outputPath, start, duration, subtitlePath }, {
      stage: 'video_clipping',
      component: 'VideoProcessor',
      provider: 'FFmpeg',
      timeoutMs: 1000 * 60 * 5, // 5 minute hard timeout
      timeoutType: 'process_timeout',
      validateInput: ({ inputPath }) => fs.existsSync(inputPath),
      execute: async ({ inputPath, outputPath, start, duration }) => {
        const bin = getBinaryPath('ffmpeg');
        let cropPlan: SmartCropPlan;

        const contentType = nexusCropPlan?.content_type || 'mixed';
        const recommendedZoom = nexusCropPlan?.recommended_zoom;
        // Lock neutral zoom factor (1.0) to preserve full vertical context and eliminate head/chin cutoffs
        const zoomFactor = typeof recommendedZoom === 'number' && recommendedZoom > 0 && recommendedZoom <= 1.05
          ? recommendedZoom
          : 1.0;

        const cropWidth = 1080;
        const cropHeight = 1920;

        let scaledWidth = Math.round(cropWidth * zoomFactor);
        let scaledHeight = Math.round(cropHeight * zoomFactor);
        let maxOffset = Math.max(0, scaledWidth - cropWidth);
        let maxVOffset = Math.max(0, scaledHeight - cropHeight);

        try {
          const { width, height } = await this.getVideoDimensions(inputPath);
          const widthRatio = (cropWidth * zoomFactor) / width;
          const heightRatio = (cropHeight * zoomFactor) / height;
          const uniformRatio = Math.max(widthRatio, heightRatio);

          scaledWidth = roundEven(width * uniformRatio);
          scaledHeight = roundEven(height * uniformRatio);
          maxOffset = Math.max(0, scaledWidth - cropWidth);
          maxVOffset = Math.max(0, scaledHeight - cropHeight);
        } catch (e: any) {
          console.warn(`[VideoProcessor]: Dimension lookup failed, forcing safe crop bounds: ${e.message}`);
        }

        let cropFilter = '';

        if (contentType === 'dual_split' || contentType === 'podcast_split' || nexusCropPlan?.layout === 'dual_split') {
          // SOTA Dual-Speaker Stacked Split Layout (Top: Host / Speaker A, Bottom: Guest / Speaker B)
          console.log(`[VideoProcessor]: Applying SOTA Dual-Speaker Stacked Split Layout (1080x960 Top + 1080x960 Bottom)...`);
          const s1X = nexusCropPlan?.speaker1_x ?? 0;
          const s2X = nexusCropPlan?.speaker2_x ?? 0.5;
          cropFilter = `split[s1][s2];[s1]crop=iw*0.5:ih:iw*${s1X}:0,scale=${cropWidth}:${cropHeight/2}:flags=lanczos[top];[s2]crop=iw*0.5:ih:iw*${s2X}:0,scale=${cropWidth}:${cropHeight/2}:flags=lanczos[bot];[top][bot]vstack=inputs=2,setsar=1`;
          cropPlan = {
            mode: 'static',
            xExpression: '0',
            yExpression: '0',
            debug: 'dual-speaker stacked split (1080x1920)',
          };
        } else if (contentType === 'screen_recording' || contentType === 'presentation') {
          // Content-Focused Screen Mode: Fit 16:9 screen/slides inside 9:16 frame with High-Speed Ambient Blurred Video Backdrop
          console.log(`[VideoProcessor]: Content type is '${contentType}'. Applying High-Speed Ambient Blurred Video Backdrop filter...`);
          cropFilter = `split[bg][fg];[bg]scale=108:-1,scale=${cropWidth}:${cropHeight}:flags=bicubic[blurred];[fg]scale=${cropWidth}:-2:flags=lanczos[scaled];[blurred][scaled]overlay=0:(H-h)/2,setsar=1`;
          cropPlan = {
            mode: 'center',
            xExpression: '0',
            yExpression: '0',
            debug: `content-focused ambient blurred backdrop (${contentType})`,
          };
        } else {
          // Face-Driven & Smart Composition Mode (Talking Head, Podcast, Gaming, Mixed)
          let speakerNormX = 0.5; // default center of 16:9 source
          let speakerNormY = 0.35; // default upper third

          const clipEnd = start + duration;
          const pointsInWindow: { x: number; y: number; weight: number }[] = [];

          if (nexusCropPlan && Array.isArray(nexusCropPlan.frames_data) && nexusCropPlan.frames_data.length > 0) {
            // Filter frames strictly within the clip's timestamp window [start, clipEnd]
            const windowFrames = nexusCropPlan.frames_data.filter((f: any) => {
              const t = typeof f.time === 'number' ? f.time : 0;
              return t >= (start - 0.5) && t <= (clipEnd + 0.5);
            });

            const candidateFrames = windowFrames.length > 0 ? windowFrames : nexusCropPlan.frames_data;

            for (const f of candidateFrames) {
              // Extract primary active region (from active speaker tracker)
              if (Array.isArray(f.regions) && f.regions.length > 0) {
                const r = f.regions[0];
                if (typeof r.x === 'number' && r.x >= 0 && r.x <= 1) {
                  const weight = (typeof r.confidence === 'number' && r.confidence > 0) ? r.confidence : 1;
                  const ry = (typeof r.y === 'number' && r.y >= 0 && r.y <= 1) ? r.y : 0.35;
                  pointsInWindow.push({ x: r.x, y: ry, weight });
                }
              } else if (typeof f.x === 'number' && f.x >= 0 && f.x <= 1) {
                pointsInWindow.push({ x: f.x, y: typeof f.y === 'number' ? f.y : 0.35, weight: 1 });
              }
            }
          } else if (nexusCropPlan && Array.isArray(nexusCropPlan.points) && nexusCropPlan.points.length > 0) {
            const windowPoints = nexusCropPlan.points.filter((p: any) => {
              const t = typeof p.time === 'number' ? p.time : 0;
              return t >= (start - 0.5) && t <= (clipEnd + 0.5);
            });
            const candPoints = windowPoints.length > 0 ? windowPoints : nexusCropPlan.points;
            for (const p of candPoints) {
              if (typeof p.x === 'number' && p.x >= 0 && p.x <= 1) {
                pointsInWindow.push({ x: p.x, y: typeof p.y === 'number' ? p.y : 0.35, weight: 1 });
              }
            }
          }

          if (pointsInWindow.length > 0) {
            const totalWeight = pointsInWindow.reduce((s, p) => s + p.weight, 0);
            speakerNormX = pointsInWindow.reduce((s, p) => s + p.x * p.weight, 0) / totalWeight;
            speakerNormY = pointsInWindow.reduce((s, p) => s + p.y * p.weight, 0) / totalWeight;
          }

          // Center the 1080px crop window directly around the speaker's detected horizontal position
          const targetCropX = Math.round(Math.max(0, Math.min(maxOffset, speakerNormX * scaledWidth - cropWidth / 2)));
          // Position eye-line near the upper 35% of the 1920px frame
          const idealY = Math.round(speakerNormY * scaledHeight - cropHeight * 0.35);
          const targetCropY = Math.round(Math.max(0, Math.min(maxVOffset, idealY)));

          cropPlan = {
            mode: 'center',
            xExpression: String(targetCropX),
            yExpression: String(targetCropY),
            debug: `active-speaker-crop (xNorm=${speakerNormX.toFixed(2)}, yNorm=${speakerNormY.toFixed(2)}, target=[${targetCropX}, ${targetCropY}])`,
          };

          cropFilter = `scale=${scaledWidth}:${scaledHeight}:flags=lanczos,crop=${cropWidth}:${cropHeight}:${targetCropX}:${targetCropY},setsar=1`;
        }

        // Check if single-pass subtitle burn-in is requested
        let finalVideoFilter = cropFilter;
        if (subtitlePath && fs.existsSync(subtitlePath)) {
          const safeAssPath = path.resolve(subtitlePath).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\\\'");
          finalVideoFilter = `${cropFilter},ass='${safeAssPath}'`;
          console.log(`[VideoProcessor]: Fusing ASS caption filter into single-pass crop graph for ${outputPath}`);
        }

        const runFfmpeg = (vf: string): Promise<string> => {
          return new Promise<string>((resolve, reject) => {
            console.log(`[VideoProcessor]: Cutting clip with ${bin} at ${start}s -> ${outputPath}`);
            const preSeek = Math.max(0, start - 3);
            const fineSeek = Number((start - preSeek).toFixed(3));

            const args = [
              ...(preSeek > 0 ? ['-ss', String(preSeek)] : []),
              '-i', inputPath,
              ...(fineSeek > 0 ? ['-ss', String(fineSeek)] : []),
              '-t', String(duration),
              '-vf', vf,
              ...highQualityEncodeArgs(),
              '-af', 'aresample=async=1,loudnorm=I=-16:TP=-1.5:LRA=11',
              '-y',
              outputPath
            ];

            execFile(bin, args, { maxBuffer: 1024 * 1024 * 500 }, (error, stdout, stderr) => {
              if (error) {
                console.error('[VideoProcessor]: ffmpeg clip error:', stderr);
                reject(new PipelineError({
                  message: `ffmpeg clip failed: ${error.message}`,
                  category: ErrorCategory.FFMPEG,
                  stage: 'video_clipping',
                  component: 'VideoProcessor',
                  provider: 'FFmpeg',
                  exitCode: error.code ? Number(error.code) : undefined,
                  rootCause: stderr || error.message,
                }));
                return;
              }
              console.log('[VideoProcessor]: Clip processing complete');
              resolve(outputPath);
            });
          });
        };

        try {
          return await runFfmpeg(finalVideoFilter);
        } catch (filterErr: any) {
          if (finalVideoFilter !== cropFilter) {
            console.warn(`[VideoProcessor]: Subtitle filter failed (${filterErr.message}). Retrying with base crop filter...`);
            return await runFfmpeg(cropFilter);
          }
          throw filterErr;
        }
      },
      validateOutput: (outPath) => fs.existsSync(outPath) && fs.statSync(outPath).size > 0,
    });
  }

  /**
   * Gets metadata (title and channel) for a remote video using yt-dlp.
   */
  async getVideoMetadata(url: string): Promise<{ title?: string; channel?: string }> {
    const ytdlp = getBinaryPath('yt-dlp');
    const safeUrl = await assertSafeRemoteVideoUrl(url);
    return withYtDlpCookies((cookiePath) => {
      return new Promise((resolve) => {
        execFile(
          ytdlp,
          ['--print', '%(title)s', '--print', '%(uploader)s', ...this.getYtDlpOptionalArgs(cookiePath), safeUrl],
          (error, stdout) => {
            if (error) {
              resolve({ title: 'Unknown Video', channel: 'Unknown Channel' });
              return;
            }
            const lines = stdout.trim().split('\n');
            resolve({
              title: lines[0]?.trim() || 'Unknown Video',
              channel: lines[1]?.trim() || 'Unknown Channel',
            });
          }
        );
      });
    });
  }

  /**
   * Gets the duration of a video using ffprobe or yt-dlp.
   */
  async getVideoDuration(url: string): Promise<number> {
    const bin = getBinaryPath('ffprobe');
    // If it's a URL, we might want to use yt-dlp to get the duration without downloading
    if (url.startsWith('http')) {
      const safeUrl = await assertSafeRemoteVideoUrl(url);
      const ytdlp = getBinaryPath('yt-dlp');
      return withYtDlpCookies((cookiePath) => {
        return new Promise((resolve, reject) => {
          execFile(ytdlp, ['--get-duration', ...this.getYtDlpOptionalArgs(cookiePath), safeUrl], (error, stdout, stderr) => {
            if (error) {
              const rawMessage = [stderr, stdout, error.message].filter(Boolean).join('\n');
              return reject(this.buildYtDlpFailure(rawMessage, cookiePath));
            }
            const parts = stdout.trim().split(':').reverse();
            let seconds = 0;
            if (parts[0]) seconds += parseInt(parts[0]);
            if (parts[1]) seconds += parseInt(parts[1]) * 60;
            if (parts[2]) seconds += parseInt(parts[2]) * 3600;
            resolve(seconds);
          });
        });
      });
    }

    return new Promise((resolve, reject) => {
      const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', url];
      execFile(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, stdout) => {
        if (error) return reject(error);
        resolve(parseFloat(stdout.trim()));
      });
    });
  }

  async addCaptions(inputPath: string, outputPath: string, subtitlePath: string): Promise<string> {
    const bin = getBinaryPath('ffmpeg');
    return new Promise((resolve, reject) => {
      const safeAssPath = path.resolve(subtitlePath).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\\\'");
      const args = [
        '-i', inputPath,
        '-vf', `ass='${safeAssPath}'`,
        ...highQualityEncodeArgs(),
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '48000',
        '-y',
        outputPath
      ];

      execFile(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`ffmpeg caption failed: ${error.message}`));
          return;
        }
        resolve(outputPath);
      });
    });
  }

  /**
   * Detects silent pauses (> 0.5s) in an audio or video file using FFmpeg silencedetect.
   * Useful for high-retention jump cutting.
   */
  async detectSilenceIntervals(inputPath: string, noiseThresholdDb = -35, minDurationSec = 0.5): Promise<Array<{ start: number; end: number; duration: number }>> {
    const bin = getBinaryPath('ffmpeg');
    return new Promise((resolve) => {
      const args = [
        '-i', inputPath,
        '-af', `silencedetect=noise=${noiseThresholdDb}dB:d=${minDurationSec}`,
        '-f', 'null',
        '-'
      ];

      execFile(bin, args, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
        const output = stderr || stdout || '';
        const silences: Array<{ start: number; end: number; duration: number }> = [];
        const startRegex = /silence_start:\s*([\d.]+)/g;
        const endRegex = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;

        const starts: number[] = [];
        let match: RegExpExecArray | null;
        while ((match = startRegex.exec(output)) !== null) {
          starts.push(parseFloat(match[1]));
        }

        let idx = 0;
        while ((match = endRegex.exec(output)) !== null) {
          const end = parseFloat(match[1]);
          const duration = parseFloat(match[2]);
          const start = starts[idx] !== undefined ? starts[idx] : Math.max(0, end - duration);
          silences.push({ start, end, duration });
          idx++;
        }

        resolve(silences);
      });
    });
  }

  /**
   * Extracts analysis frames from a video segment for cinematic crop analysis.
   * Frames are extracted at 4fps as lightweight PGM images scaled to 480px wide.
   * Non-fatal on failure — cinematic cropping gracefully degrades to center crop.
   */
  async extractAnalysisFrames(
    inputPath: string, startTime: number, duration: number, outputDir: string
  ): Promise<void> {
    const bin = getBinaryPath('ffmpeg');
    return new Promise((resolve) => {
      const args = [
        '-ss', String(startTime),
        '-i', inputPath,
        '-t', String(duration),
        '-vf', 'fps=4,scale=1280:-1',
        '-f', 'image2',
        path.join(outputDir, 'frame_%04d.jpg'),
        '-y',
      ];

      console.log(`[VideoProcessor]: Extracting 720p RGB color analysis frames at 4fps for ${duration.toFixed(1)}s -> ${outputDir}`);
      execFile(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, stdout, stderr) => {
        if (error) {
          console.warn(`[VideoProcessor]: Frame extraction warning (non-fatal): ${error.message}`);
        } else {
          const frameCount = fs.readdirSync(outputDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.pgm')).length;
          console.log(`[VideoProcessor]: Extracted ${frameCount} analysis frames`);
        }
        resolve(); // Always resolve — cinematic crop will gracefully degrade
      });
    });
  }

  /**
   * Generates a thumbnail image from a video at a specific timestamp.
   */
  async generateThumbnail(inputPath: string, outputPath: string, timestamp: number = 0): Promise<string> {
    const bin = getBinaryPath('ffmpeg');
    return new Promise((resolve, reject) => {
      console.log(`[VideoProcessor]: Extracting thumbnail with ${bin} at ${timestamp}s -> ${outputPath}`);
      const args = [
        '-ss', String(timestamp),
        '-i', inputPath,
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        outputPath
      ];

      execFile(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, stdout, stderr) => {
        if (error) {
          console.error('[VideoProcessor]: ffmpeg thumbnail error:', stderr);
          reject(new Error(`ffmpeg thumbnail extraction failed: ${error.message}`));
          return;
        }
        console.log('[VideoProcessor]: Thumbnail extraction complete');
        resolve(outputPath);
      });
    });
  }

  /**
   * Overlays contextual B-roll video clips with smooth fades onto a 9:16 base vertical video.
   */
  async overlayBRoll(
    inputPath: string,
    bRollClips: Array<{ videoPath: string; startSec: number; durationSec: number; layout?: string }>,
    outputPath: string
  ): Promise<string> {
    if (!bRollClips || bRollClips.length === 0) {
      fs.copyFileSync(inputPath, outputPath);
      return outputPath;
    }

    const bin = getBinaryPath('ffmpeg');
    const inputs: string[] = ['-i', inputPath];
    for (const clip of bRollClips) {
      inputs.push('-i', clip.videoPath);
    }

    let filterGraph = '';
    let currentBase = '[0:v]';

    for (let i = 0; i < bRollClips.length; i++) {
      const clip = bRollClips[i];
      const inputIdx = i + 1;
      const overlayOut = `[ovl${i}]`;
      const nextBase = i === bRollClips.length - 1 ? '[outv]' : `[base${i}]`;

      const start = clip.startSec;
      const end = clip.startSec + clip.durationSec;
      const fadeDuration = 0.3;

      let scaledBRoll = `[${inputIdx}:v]scale=960:540:force_original_aspect_ratio=decrease,format=yuva420p,fade=t=in:st=0:d=${fadeDuration}:alpha=1,fade=t=out:st=${clip.durationSec - fadeDuration}:d=${fadeDuration}:alpha=1${overlayOut}`;
      let overlayX = '(W-w)/2';
      let overlayY = clip.layout === 'picture_in_picture_top' ? '180' : '(H-h)/2';

      if (clip.layout === 'full_cutaway') {
        scaledBRoll = `[${inputIdx}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuva420p,fade=t=in:st=0:d=${fadeDuration}:alpha=1,fade=t=out:st=${clip.durationSec - fadeDuration}:d=${fadeDuration}:alpha=1${overlayOut}`;
        overlayX = '0';
        overlayY = '0';
      }

      filterGraph += (filterGraph ? ';' : '') + `${scaledBRoll};${currentBase}${overlayOut}overlay=${overlayX}:${overlayY}:enable='between(t,${start},${end})'${nextBase}`;
      currentBase = nextBase;
    }

    const args = [
      ...inputs,
      '-filter_complex', filterGraph,
      '-map', '[outv]',
      '-map', '0:a?',
      ...highQualityEncodeArgs(),
      '-c:a', 'copy',
      '-y',
      outputPath,
    ];

    console.log(`[VideoProcessor]: Applying ${bRollClips.length} AI B-Roll contextual overlays -> ${outputPath}`);
    return new Promise((resolve, reject) => {
      execFile(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, _stdout, stderr) => {
        if (error) {
          console.error('[VideoProcessor]: FFmpeg B-Roll overlay error:', stderr);
          return reject(new Error(`FFmpeg B-roll overlay failed: ${error.message}`));
        }
        resolve(outputPath);
      });
    });
  }

  /**
   * Adds an editorial top hook card and an animated bottom progress bar to the vertical video.
   */
  async addHookAndProgressBar(
    inputPath: string,
    outputPath: string,
    hookText: string,
    totalDurationSec: number
  ): Promise<string> {
    const bin = getBinaryPath('ffmpeg');
    const safeHook = hookText.replace(/'/g, '').replace(/:/g, ' - ');
    const fontPath = 'C\\:/Windows/Fonts/arial.ttf';
    const fontOption = fs.existsSync('C:/Windows/Fonts/arial.ttf') ? `:fontfile='${fontPath}'` : '';

    const dur = Math.max(0.1, totalDurationSec);
    const filterGraph =
      // 1. Top Hook Banner for first 4.5 seconds
      `drawbox=x=60:y=80:w=960:h=85:color=black@0.8:t=fill:enable='lt(t,4.5)',` +
      `drawbox=x=60:y=80:w=12:h=85:color=red@1.0:t=fill:enable='lt(t,4.5)',` +
      `drawtext=text='${safeHook}'${fontOption}:fontsize=34:fontcolor=white:x=(w-text_w)/2+10:y=105:enable='lt(t,4.5)',` +
      // 2. Animated Progress Bar at bottom (y=1900)
      `drawbox=x=0:y=1905:w=1080:h=15:color=white@0.2:t=fill,` +
      `drawbox=x=0:y=1905:w='1080*(t/${dur})':h=15:color=yellow@0.95:t=fill`;

    const args = [
      '-i', inputPath,
      '-vf', filterGraph,
      ...highQualityEncodeArgs(),
      '-c:a', 'copy',
      '-y',
      outputPath,
    ];

    console.log(`[VideoProcessor]: Adding Hook Card ("${hookText}") & Animated Progress Bar -> ${outputPath}`);
    return new Promise((resolve, reject) => {
      execFile(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, _stdout, stderr) => {
        if (error) {
          console.error('[VideoProcessor]: Hook & Progress bar render error:', stderr);
          return reject(new Error(`Hook & Progress bar render failed: ${error.message}`));
        }
        resolve(outputPath);
      });
    });
  }
}


