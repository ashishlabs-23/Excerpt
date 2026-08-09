"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoProcessor = exports.getBinaryPath = void 0;
const child_process_1 = require("child_process");
const path_1 = require("path");
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const clipping_core_1 = require("@excerpt/clipping-core");
const urlSafety_1 = require("./urlSafety");
const cookieHelper_1 = require("../lib/cookieHelper");
const binaryPathCache = new Map();
function findBinaryUnder(rootDir, binaryName, maxDepth = 3) {
    if (!rootDir || !fs_1.default.existsSync(rootDir))
        return null;
    const queue = [{ dir: rootDir, depth: 0 }];
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current)
            break;
        let entries = [];
        try {
            entries = fs_1.default.readdirSync(current.dir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const fullPath = path_1.default.join(current.dir, entry.name);
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
function getWindowsBinaryCandidates(name) {
    if (process.platform !== 'win32')
        return [];
    const executable = `${name}.exe`;
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    const commonCandidates = [
        path_1.default.join(localAppData, 'Microsoft', 'WinGet', 'Links', executable),
        path_1.default.join(userProfile, 'scoop', 'shims', executable),
        path_1.default.join('C:\\ffmpeg', 'bin', executable),
        path_1.default.join('C:\\Program Files', 'ffmpeg', 'bin', executable),
        path_1.default.join('C:\\Program Files (x86)', 'ffmpeg', 'bin', executable),
    ];
    if (name === 'yt-dlp') {
        commonCandidates.push(path_1.default.join(localAppData, 'Microsoft', 'WinGet', 'Packages', 'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe', executable));
    }
    const wingetPackages = path_1.default.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    const detected = findBinaryUnder(wingetPackages, executable, 4);
    if (detected) {
        commonCandidates.push(detected);
    }
    return commonCandidates.filter((candidate, index, all) => {
        return all.indexOf(candidate) === index && fs_1.default.existsSync(candidate);
    });
}
// Helper to get binary path with Windows fallbacks for local development
const getBinaryPath = (name) => {
    const cached = binaryPathCache.get(name);
    if (cached)
        return cached;
    const envKey = `${name.toUpperCase().replace(/-/g, '_')}_PATH`;
    const envPath = process.env[envKey];
    if (envPath && fs_1.default.existsSync(envPath)) {
        binaryPathCache.set(name, envPath);
        return envPath;
    }
    // Inside Docker, they are in the system path
    if (process.env.NODE_ENV === 'production')
        return name;
    // Local relative fallback for Windows dev
    const relativePath = path_1.default.join(__dirname, '..', '..', 'bin', `${name}.exe`);
    if (fs_1.default.existsSync(relativePath)) {
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
exports.getBinaryPath = getBinaryPath;
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
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const roundEven = (value) => {
    const rounded = Math.round(value);
    return rounded % 2 === 0 ? rounded : rounded + 1;
};
class UserFacingFailure extends Error {
    constructor(options) {
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
class VideoProcessor {
    redactSensitivePaths(rawMessage) {
        const sensitivePaths = [
            process.env.YTDLP_COOKIES_PATH,
            process.env.YTDLP_COOKIES_DIR,
        ]
            .map((value) => value?.trim())
            .filter((value) => Boolean(value));
        return sensitivePaths.reduce((message, sensitivePath) => (message.split(sensitivePath).join('[redacted-cookie-path]')), rawMessage);
    }
    getYtDlpOptionalArgs(cookiesPath) {
        const args = [];
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
    buildYtDlpFailure(rawMessage, cookiesPath) {
        const safeMessage = this.redactSensitivePaths(rawMessage);
        const normalized = safeMessage.toLowerCase();
        const cookieFilePresent = Boolean(cookiesPath);
        const hasSessionSupport = cookieFilePresent || Boolean(process.env.YTDLP_COOKIES_FROM_BROWSER?.trim());
        if (normalized.includes('http error 429') ||
            normalized.includes('too many requests') ||
            normalized.includes("sign in to confirm you're not a bot") ||
            normalized.includes('--cookies-from-browser') ||
            normalized.includes('unable to download api page')) {
            return new UserFacingFailure({
                code: 'youtube_verification_required',
                title: 'YouTube Verification Required',
                userMessage: hasSessionSupport
                    ? 'YouTube blocked this download even with the current session settings.'
                    : 'This YouTube video needs a verified session before the server can download it.',
                details: 'The worker was stopped by a YouTube anti-bot or rate-limit checkpoint before clipping could begin.',
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
    async getVideoDimensions(inputPath) {
        const bin = (0, exports.getBinaryPath)('ffprobe');
        return new Promise((resolve, reject) => {
            const args = [
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height',
                '-of', 'csv=p=0:s=x',
                inputPath,
            ];
            (0, child_process_1.execFile)(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, stdout, stderr) => {
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
    smoothCropPoints(points) {
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
    compressCropPoints(points, maxPoints = 8) {
        if (points.length <= 1) {
            return points;
        }
        const compressed = [points[0]];
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
    buildCropExpression(points, maxOffset, maxVOffset) {
        if (points.length === 0) {
            return {
                mode: 'center',
                xExpression: (maxOffset * 0.35).toFixed(2),
                yExpression: (maxVOffset * 0.25).toFixed(2),
                debug: 'rule-of-thirds fallback (no points)',
            };
        }
        const buildSegmentedExpression = (vals, times) => {
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
                const segmentExpression = Math.abs(rightVal - leftVal) < 1
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
    getCacheKey(url) {
        return crypto_1.default.createHash('md5').update(url).digest('hex').substring(0, 12);
    }
    /**
     * Downloads a video from YouTube using yt-dlp via Download Intelligence Engine.
     */
    async downloadVideo(url, outputPath, onProgress) {
        const { downloadEngine } = require('./download');
        return downloadEngine.executeDownload(url, outputPath, onProgress || (() => { }));
    }
    /**
     * Extracts audio from a video file.
     */
    async extractAudio(inputPath, outputPath) {
        return clipping_core_1.StageExecutor.run({ inputPath, outputPath }, {
            stage: 'audio_extraction',
            component: 'VideoProcessor',
            provider: 'FFmpeg',
            timeoutMs: 1000 * 60 * 5, // 5 minute hard timeout
            timeoutType: 'process_timeout',
            validateInput: ({ inputPath }) => fs_1.default.existsSync(inputPath),
            execute: async ({ inputPath, outputPath }) => {
                const bin = (0, exports.getBinaryPath)('ffmpeg');
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
                    (0, child_process_1.execFile)(bin, args, { maxBuffer: 1024 * 1024 * 500 }, (error, stdout, stderr) => {
                        if (error) {
                            console.error('[VideoProcessor]: ffmpeg audio extraction error:', stderr);
                            reject(new clipping_core_1.PipelineError({
                                message: `ffmpeg audio extraction failed: ${error.message}`,
                                category: clipping_core_1.ErrorCategory.FFMPEG,
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
            validateOutput: (outPath) => fs_1.default.existsSync(outPath) && fs_1.default.statSync(outPath).size > 0,
        });
    }
    /**
     * Cuts a video segment and applies 9:16 cropping.
     */
    async processClip(inputPath, outputPath, start, duration, nexusCropPlan) {
        return clipping_core_1.StageExecutor.run({ inputPath, outputPath, start, duration }, {
            stage: 'video_clipping',
            component: 'VideoProcessor',
            provider: 'FFmpeg',
            timeoutMs: 1000 * 60 * 5, // 5 minute hard timeout
            timeoutType: 'process_timeout',
            validateInput: ({ inputPath }) => fs_1.default.existsSync(inputPath),
            execute: async ({ inputPath, outputPath, start, duration }) => {
                const bin = (0, exports.getBinaryPath)('ffmpeg');
                let cropPlan;
                const contentType = nexusCropPlan?.content_type || 'mixed';
                const recommendedZoom = nexusCropPlan?.recommended_zoom;
                // Lock neutral zoom factor (1.0) to preserve full vertical context and eliminate head/chin cutoffs
                const zoomFactor = typeof recommendedZoom === 'number' && recommendedZoom > 0 && recommendedZoom <= 1.05
                    ? recommendedZoom
                    : 1.0;
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
                }
                catch (e) {
                    console.warn(`[VideoProcessor]: Dimension lookup failed, forcing safe crop bounds: ${e.message}`);
                }
                let cropFilter = '';
                if (contentType === 'screen_recording' || contentType === 'presentation') {
                    // Content-Focused Screen Mode: Fit 16:9 screen/slides inside 9:16 frame with top/bottom padding
                    console.log(`[VideoProcessor]: Content type is '${contentType}'. Applying Content-Focused Screen Padding filter...`);
                    cropFilter = `scale=${cropWidth}:-2:flags=lanczos,pad=${cropWidth}:${cropHeight}:0:(oh-ih)/2:color=black@0.95,setsar=1`;
                    cropPlan = {
                        mode: 'center',
                        xExpression: '0',
                        yExpression: '0',
                        debug: `content-focused screen padding (${contentType})`,
                    };
                }
                else {
                    // Face-Driven & Smart Composition Mode (Talking Head, Podcast, Gaming, Mixed)
                    if (nexusCropPlan && nexusCropPlan.points && nexusCropPlan.points.length > 0) {
                        try {
                            const smoothedPoints = this.smoothCropPoints(nexusCropPlan.points);
                            const compressedPoints = this.compressCropPoints(smoothedPoints);
                            cropPlan = this.buildCropExpression(compressedPoints, maxOffset, maxVOffset);
                            cropPlan.mode = 'dynamic';
                        }
                        catch (error) {
                            // Smart Composition Fallback: Eye-Line (Y=25% margin) + Rule of Thirds (X=35%)
                            cropPlan = {
                                mode: 'center',
                                xExpression: '(in_w-out_w)*0.35',
                                yExpression: '(in_h-out_h)*0.25',
                                debug: 'rule-of-thirds fallback (expression failure)',
                            };
                        }
                    }
                    else {
                        // Smart Composition Fallback: Eye-Line (Y=25% margin) + Rule of Thirds (X=35%)
                        cropPlan = {
                            mode: 'center',
                            xExpression: '(in_w-out_w)*0.35',
                            yExpression: '(in_h-out_h)*0.25',
                            debug: 'rule-of-thirds fallback (analysis fallback)',
                        };
                    }
                    cropFilter = `scale=${scaledWidth}:${scaledHeight}:flags=lanczos,crop=${cropWidth}:${cropHeight}:'${cropPlan.xExpression}':'${cropPlan.yExpression}',setsar=1`;
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
                    (0, child_process_1.execFile)(bin, args, { maxBuffer: 1024 * 1024 * 500 }, (error, stdout, stderr) => {
                        if (error) {
                            console.error('[VideoProcessor]: ffmpeg clip error:', stderr);
                            reject(new clipping_core_1.PipelineError({
                                message: `ffmpeg clip failed: ${error.message}`,
                                category: clipping_core_1.ErrorCategory.FFMPEG,
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
            },
            validateOutput: (outPath) => fs_1.default.existsSync(outPath) && fs_1.default.statSync(outPath).size > 0,
        });
    }
    /**
     * Gets metadata (title and channel) for a remote video using yt-dlp.
     */
    async getVideoMetadata(url) {
        const ytdlp = (0, exports.getBinaryPath)('yt-dlp');
        const safeUrl = await (0, urlSafety_1.assertSafeRemoteVideoUrl)(url);
        return (0, cookieHelper_1.withYtDlpCookies)((cookiePath) => {
            return new Promise((resolve) => {
                (0, child_process_1.execFile)(ytdlp, ['--print', '%(title)s', '--print', '%(uploader)s', ...this.getYtDlpOptionalArgs(cookiePath), safeUrl], (error, stdout) => {
                    if (error) {
                        resolve({ title: 'Unknown Video', channel: 'Unknown Channel' });
                        return;
                    }
                    const lines = stdout.trim().split('\n');
                    resolve({
                        title: lines[0]?.trim() || 'Unknown Video',
                        channel: lines[1]?.trim() || 'Unknown Channel',
                    });
                });
            });
        });
    }
    /**
     * Gets the duration of a video using ffprobe or yt-dlp.
     */
    async getVideoDuration(url) {
        const bin = (0, exports.getBinaryPath)('ffprobe');
        // If it's a URL, we might want to use yt-dlp to get the duration without downloading
        if (url.startsWith('http')) {
            const safeUrl = await (0, urlSafety_1.assertSafeRemoteVideoUrl)(url);
            const ytdlp = (0, exports.getBinaryPath)('yt-dlp');
            return (0, cookieHelper_1.withYtDlpCookies)((cookiePath) => {
                return new Promise((resolve, reject) => {
                    (0, child_process_1.execFile)(ytdlp, ['--get-duration', ...this.getYtDlpOptionalArgs(cookiePath), safeUrl], (error, stdout, stderr) => {
                        if (error) {
                            const rawMessage = [stderr, stdout, error.message].filter(Boolean).join('\n');
                            return reject(this.buildYtDlpFailure(rawMessage, cookiePath));
                        }
                        const parts = stdout.trim().split(':').reverse();
                        let seconds = 0;
                        if (parts[0])
                            seconds += parseInt(parts[0]);
                        if (parts[1])
                            seconds += parseInt(parts[1]) * 60;
                        if (parts[2])
                            seconds += parseInt(parts[2]) * 3600;
                        resolve(seconds);
                    });
                });
            });
        }
        return new Promise((resolve, reject) => {
            const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', url];
            (0, child_process_1.execFile)(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, stdout) => {
                if (error)
                    return reject(error);
                resolve(parseFloat(stdout.trim()));
            });
        });
    }
    async addCaptions(inputPath, outputPath, subtitlePath) {
        const bin = (0, exports.getBinaryPath)('ffmpeg');
        return new Promise((resolve, reject) => {
            const relativeSubPath = path_1.default.relative(process.cwd(), subtitlePath).replace(/\\/g, '/').replace(/'/g, "\\\\'");
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
            (0, child_process_1.execFile)(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, stdout, stderr) => {
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
    async extractAnalysisFrames(inputPath, startTime, duration, outputDir) {
        const bin = (0, exports.getBinaryPath)('ffmpeg');
        return new Promise((resolve) => {
            const args = [
                '-ss', String(startTime),
                '-i', inputPath,
                '-t', String(duration),
                '-vf', 'fps=4,scale=1280:-1',
                '-f', 'image2',
                path_1.default.join(outputDir, 'frame_%04d.jpg'),
                '-y',
            ];
            console.log(`[VideoProcessor]: Extracting 720p RGB color analysis frames at 4fps for ${duration.toFixed(1)}s -> ${outputDir}`);
            (0, child_process_1.execFile)(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    console.warn(`[VideoProcessor]: Frame extraction warning (non-fatal): ${error.message}`);
                }
                else {
                    const frameCount = fs_1.default.readdirSync(outputDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.pgm')).length;
                    console.log(`[VideoProcessor]: Extracted ${frameCount} analysis frames`);
                }
                resolve(); // Always resolve — cinematic crop will gracefully degrade
            });
        });
    }
    /**
     * Generates a thumbnail image from a video at a specific timestamp.
     */
    async generateThumbnail(inputPath, outputPath, timestamp = 0) {
        const bin = (0, exports.getBinaryPath)('ffmpeg');
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
            (0, child_process_1.execFile)(bin, args, { maxBuffer: 1024 * 1024 * 500, timeout: 1000 * 60 * 10 }, (error, stdout, stderr) => {
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
exports.VideoProcessor = VideoProcessor;
