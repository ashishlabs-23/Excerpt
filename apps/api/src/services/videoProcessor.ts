import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
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
  return [
    '-c:v', 'libx264',
    '-preset', isDraft ? 'ultrafast' : 'veryfast',
    '-crf', isDraft ? '24' : '18',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-threads', '2',
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

interface SmartCropPlan {
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
    const extractorArgs = process.env.YTDLP_EXTRACTOR_ARGS?.trim() || "youtube:player_client=android";

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
        xExpression: '0',
        yExpression: (maxVOffset / 2).toFixed(2),
        debug: 'center crop (no points)',
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
   * Downloads a video from YouTube using yt-dlp.
   */
  async downloadVideo(url: string, outputPath: string, onProgress?: (percent: number) => void): Promise<string> {
    const safeUrl = await assertSafeRemoteVideoUrl(url);
    const bin = getBinaryPath('yt-dlp');
    const ffmpegBin = getBinaryPath('ffmpeg');
    return withYtDlpCookies((cookiePath) => {
      return new Promise((resolve, reject) => {
        console.log(`[VideoProcessor]: Downloading with ${bin} (FFmpeg location: ${ffmpegBin}) -> ${outputPath}`);
        const args = [
          '-f', 'bestvideo+bestaudio/best',
          '--merge-output-format', 'mp4',
          '-o', outputPath,
          '--no-playlist',
          '--no-cache-dir',
        ];
        if (ffmpegBin !== 'ffmpeg' && ffmpegBin !== 'ffmpeg.exe') {
          args.push('--ffmpeg-location', ffmpegBin);
        }
        args.push(
          '--geo-bypass',
          '--no-write-subs',
          '--no-embed-subs',
          '--no-write-auto-subs',
          '--extractor-args', 'youtube:player_client=android,web',
          '--user-agent', 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
          '--add-header', 'X-YouTube-Client-Name:3',
          '--add-header', 'X-YouTube-Client-Version:19.09.37',
          '--retries', '10',
          '--retry-sleep', '5',
          '--fragment-retries', '10',
          '--sleep-interval', '3',
          '--max-sleep-interval', '12',
          '--limit-rate', '10M',
          '--no-check-certificates',
          '--verbose',
          ...this.getYtDlpOptionalArgs(cookiePath),
          '--newline',
          '--progress',
          safeUrl
        );

        const proc = execFile(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, stdout, stderr) => {
          console.log(`[VideoProcessor]: yt-dlp finished. Exit code: ${error?.code || 0}`);
          console.log(`[VideoProcessor]: yt-dlp stdout:\n${stdout}`);
          console.log(`[VideoProcessor]: yt-dlp stderr:\n${stderr}`);
          if (error) {
            const rawMessage = [stderr, stdout, error?.message].filter(Boolean).join('\n');
            console.error('[VideoProcessor]: yt-dlp error:', rawMessage);
            
            // Check if file actually exists despite error (sometimes thrown for warnings)
            if (fs.existsSync(outputPath)) {
              console.log('[VideoProcessor]: File exists despite error, proceeding...');
              return resolve(outputPath);
            }
            reject(this.buildYtDlpFailure(rawMessage, cookiePath));
            return;
          }

          if (!fs.existsSync(outputPath)) {
            console.error('[VideoProcessor]: outputPath is missing! yt-dlp stderr:', stderr, 'stdout:', stdout);
            console.log(`[VideoProcessor]: Download failed for ${url}, trying fallback logic...`);
          }

        // FIX: yt-dlp naming quirk: check if it added a suffix like .f137.mp4 or similar
        if (!fs.existsSync(outputPath)) {
          const dir = path.dirname(outputPath);
          console.log(`[VideoProcessor]: Direct path ${outputPath} missing, searching for fragments in ${dir}...`);
          const files = fs.readdirSync(dir);
          
          // Robust match: find files starting with "input" and containing ".mp4" or ".webm"
          // This catches "input.f401.mp4", "input.mp4.webm", etc.
          const matches = files
            .filter(f => f.startsWith('input') && (f.endsWith('.mp4') || f.endsWith('.webm') || f.includes('.mp4')))
            .map(f => ({ name: f, size: fs.statSync(path.join(dir, f)).size }))
            .sort((a, b) => b.size - a.size);

          if (matches.length > 0) {
            const bestMatch = matches[0].name;
            const matchPath = path.join(dir, bestMatch);
            console.log(`[VideoProcessor]: Found best fragment match: ${bestMatch} (${matches[0].size} bytes). Renaming to ${outputPath}`);
            try {
              fs.renameSync(matchPath, outputPath);
            } catch (renameErr) {
              console.warn(`[VideoProcessor]: Rename failed, resolving with match path directly.`);
              resolve(matchPath);
              return;
            }
          } else {
            reject(new Error(`Download failed: File not found at ${outputPath} and no fragments match 'input*' in ${dir}`));
            return;
          }
        }

        console.log('[VideoProcessor]: Download complete');
        resolve(outputPath);
      });

      // Stream stdout to parse progress percentages
      proc.stdout?.on('data', (data) => {
        const msg = data.toString().trim();
        if (onProgress && msg.includes('%')) {
          // Extract percentage like 16.9%
          const match = msg.match(/(\d+(\.\d+)?)%/);
          if (match && match[1]) {
            onProgress(parseFloat(match[1]));
          }
        }
        if (msg.includes('%')) console.log(`[yt-dlp]: ${msg}`);
      });

      proc.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[yt-dlp-err]: ${msg}`);
      });
    });
    });
  }

  /**
   * Extracts audio from a video file.
   */
  async extractAudio(inputPath: string, outputPath: string): Promise<string> {
    const bin = getBinaryPath('ffmpeg');
    return new Promise((resolve, reject) => {
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

      execFile(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, stdout, stderr) => {
        if (error) {
          console.error('[VideoProcessor]: ffmpeg audio extraction error:', stderr);
          reject(new Error(`ffmpeg audio extraction failed: ${error.message}`));
          return;
        }
        console.log('[VideoProcessor]: Audio extraction complete');
        resolve(outputPath);
      });
    });
  }

  /**
   * Cuts a video segment and applies 9:16 cropping.
   */
  async processClip(inputPath: string, outputPath: string, start: number, duration: number, nexusCropPlan?: any): Promise<string> {
    const bin = getBinaryPath('ffmpeg');
    const workingDir = path.dirname(outputPath);
    let cropPlan: SmartCropPlan;

    // ADAPTIVE ZOOM: content-aware zoom factor from smart_crop analysis
    const contentType = nexusCropPlan?.content_type || 'mixed';
    const recommendedZoom = nexusCropPlan?.recommended_zoom;
    const zoomFactor = typeof recommendedZoom === 'number' && recommendedZoom > 0
      ? recommendedZoom
      : contentType === 'screen_recording' ? 1.0
      : contentType === 'presentation' ? 1.05
      : contentType === 'talking_head' ? 1.20
      : 1.10;
    console.log(`[VideoProcessor]: Content type: ${contentType} | Zoom factor: ${zoomFactor}`); 
    const isDraft = process.env.RENDER_MODE === 'draft';
    const cropWidth = isDraft ? 720 : 1080;
    const cropHeight = isDraft ? 1280 : 1920;

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
      
      console.log(`[VideoProcessor]: Resolution Match -> Input ${width}x${height} | Scaled ${scaledWidth}x${scaledHeight} | Target ${cropWidth}x${cropHeight}`);
    } catch (e: any) {
      console.warn(`[VideoProcessor]: Dimension lookup failed, forcing safe crop bounds. ${e.message}`);
    }

    if (nexusCropPlan && nexusCropPlan.points && nexusCropPlan.points.length > 0) {
      try {
        console.log(`[VideoProcessor]: Using Nexus Cinematic Crop Plan (${nexusCropPlan.points.length} points)`);
        
        const smoothedPoints = this.smoothCropPoints(nexusCropPlan.points);
        const compressedPoints = this.compressCropPoints(smoothedPoints);
        cropPlan = this.buildCropExpression(compressedPoints, maxOffset, maxVOffset);
        cropPlan.mode = 'dynamic';
        cropPlan.debug = `cinematic nexus crop over ${compressedPoints.length}/${nexusCropPlan.points.length} points`;
      } catch (error: any) {
        console.warn(`[VideoProcessor]: Failed to build crop expression from Nexus plan. Falling back to center crop. ${error.message}`);
        cropPlan = {
          mode: 'center',
          xExpression: '(in_w-out_w)/2',
          yExpression: '(in_h-out_h)/2',
          debug: 'center crop (expression failure)',
        };
      }
    } else {
      console.warn(`[VideoProcessor]: Nexus crop plan missing or empty. Using center fallback.`);
      cropPlan = {
        mode: 'center',
        xExpression: '(in_w-out_w)/2',
        yExpression: '(in_h-out_h)/2',
        debug: 'center crop (analysis fallback)',
      };
    }

    let cropFilter = `scale=${scaledWidth}:${scaledHeight}:flags=lanczos,crop=${cropWidth}:${cropHeight}:'${cropPlan.xExpression}':'${cropPlan.yExpression}',setsar=1`;
    
    // Unified Crop Planner Engine
    if (nexusCropPlan && nexusCropPlan.frames_data && nexusCropPlan.frames_data.length > 0) {
      const firstLayout = nexusCropPlan.frames_data[0].layout;
      
      if (firstLayout === 'split') {
        console.log(`[VideoProcessor]: Universal Crop Planner -> applying dynamic region tracking for split-screen stack`);
        
        // Extract top region points
        const topPoints = nexusCropPlan.frames_data.map((f: any) => {
          const reg = f.regions.find((r: any) => r.slot === 'top');
          return { index: f.index, time: f.time, offset: reg?.x || 0.5, y_offset: reg?.y || 0.5, confidence: reg?.confidence || 0 };
        });
        
        // Extract bottom region points
        const botPoints = nexusCropPlan.frames_data.map((f: any) => {
          const reg = f.regions.find((r: any) => r.slot === 'bottom');
          return { index: f.index, time: f.time, offset: reg?.x || 0.5, y_offset: reg?.y || 0.5, confidence: reg?.confidence || 0 };
        });

        // The split screen divides height by 2. We recalculate maxVOffset.
        const halfHeight = cropHeight / 2;
        const maxVOffsetHalf = Math.max(0, scaledHeight - halfHeight);
        
        const topPlan = this.buildCropExpression(this.compressCropPoints(this.smoothCropPoints(topPoints)), maxOffset, maxVOffsetHalf);
        const botPlan = this.buildCropExpression(this.compressCropPoints(this.smoothCropPoints(botPoints)), maxOffset, maxVOffsetHalf);

        cropFilter = `[0:v]scale=${scaledWidth}:${scaledHeight}:flags=lanczos,crop=${cropWidth}:${halfHeight}:'${topPlan.xExpression}':'${topPlan.yExpression}'[top];[0:v]scale=${scaledWidth}:${scaledHeight}:flags=lanczos,crop=${cropWidth}:${halfHeight}:'${botPlan.xExpression}':'${botPlan.yExpression}'[bottom];[top][bottom]vstack=inputs=2,setsar=1`;
      }
    } else if (nexusCropPlan && nexusCropPlan.layout_mode === 'split-screen') {
      // Legacy fallback
      console.log(`[VideoProcessor]: Legacy split-screen stack`);
      cropFilter = `[0:v]scale=${scaledWidth}:${scaledHeight}:flags=lanczos,crop=1080:960:0:0[top];[0:v]scale=${scaledWidth}:${scaledHeight}:flags=lanczos,crop=1080:960:${maxOffset}:0[bottom];[top][bottom]vstack=inputs=2,setsar=1`;
    }

    return new Promise((resolve, reject) => {
      console.log(`[VideoProcessor]: Cutting clip with ${bin} at ${start}s -> ${outputPath}`);
      const args = [
        '-ss', String(start),
        '-i', inputPath,
        '-t', String(duration),
        '-vf', cropFilter,
        ...highQualityEncodeArgs(),
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '48000',
        '-y',
        outputPath
      ];

      execFile(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, stdout, stderr) => {
        if (error) {
          console.error('[VideoProcessor]: ffmpeg clip error:', stderr);
          reject(new Error(`ffmpeg clip failed: ${error.message}`));
          return;
        }
        console.log('[VideoProcessor]: Clip processing complete');
        resolve(outputPath);
      });
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
      const relativeSubPath = path.relative(process.cwd(), subtitlePath).replace(/\\/g, '/').replace(/'/g, "\\\\'");
      const args = [
        '-i', inputPath,
        '-vf', `ass='${relativeSubPath}'`,
        ...highQualityEncodeArgs(),
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
        '-vf', 'fps=4,scale=640:-1',
        '-f', 'image2',
        path.join(outputDir, 'frame_%04d.pgm'),
        '-y',
      ];

      console.log(`[VideoProcessor]: Extracting analysis frames at 4fps for ${duration.toFixed(1)}s -> ${outputDir}`);
      execFile(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, stdout, stderr) => {
        if (error) {
          console.warn(`[VideoProcessor]: Frame extraction warning (non-fatal): ${error.message}`);
        } else {
          const frameCount = fs.readdirSync(outputDir).filter(f => f.endsWith('.pgm')).length;
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
}

