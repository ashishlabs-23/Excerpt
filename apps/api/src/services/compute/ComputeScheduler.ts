import os from 'os';
import { execFile } from 'child_process';
import util from 'util';
import pLimit, { Limit } from 'p-limit';
import { getBinaryPath } from '../binaryPath';

const execFileAsync = util.promisify(execFile);

export type EncoderBackend = 'h264_qsv' | 'h264_nvenc' | 'h264_amf' | 'libx264';
export type GenerationMode = 'draft' | 'quality';

export interface RenderCapabilities {
  cpuCores: number;
  cpuModel: string;
  ramBytes: number;
  ramFreeBytes: number;
  gpuVendor: 'intel' | 'nvidia' | 'amd' | 'none';
  qsvAvailable: boolean;
  nvencAvailable: boolean;
  amfAvailable: boolean;
  maxGpuSlots: number;
  maxCpuSlots: number;
  threadsPerCpuSlot: number;
  recommendedBackend: EncoderBackend;
}

export interface EncoderPolicy {
  backend: EncoderBackend;
  mode: GenerationMode;
  maxConcurrent: number;
  threads?: number;
}

export class ComputeScheduler {
  private static instance: ComputeScheduler;
  private capabilities: RenderCapabilities | null = null;
  private probePromise: Promise<RenderCapabilities> | null = null;

  private gpuLimiter: Limit | null = null;
  private cpuLimiter: Limit | null = null;

  private activeGpuJobs = 0;
  private activeCpuJobs = 0;

  private constructor() {}

  public static getInstance(): ComputeScheduler {
    if (!ComputeScheduler.instance) {
      ComputeScheduler.instance = new ComputeScheduler();
    }
    return ComputeScheduler.instance;
  }

  /**
   * One-time hardware capability detection at worker startup (memoized).
   */
  public async getCapabilities(): Promise<RenderCapabilities> {
    if (this.capabilities) {
      return this.capabilities;
    }
    if (this.probePromise) {
      return this.probePromise;
    }

    this.probePromise = this.probeSystemCapabilities();
    this.capabilities = await this.probePromise;
    this.probePromise = null;
    return this.capabilities;
  }

  private async probeSystemCapabilities(): Promise<RenderCapabilities> {
    const cpuCores = os.cpus().length;
    const cpuModel = os.cpus()[0]?.model || 'Generic CPU';
    const ramBytes = os.totalmem();
    const ramFreeBytes = os.freemem();

    let qsvAvailable = false;
    let nvencAvailable = false;
    let amfAvailable = false;
    let gpuVendor: RenderCapabilities['gpuVendor'] = 'none';

    try {
      const ffmpegBin = getBinaryPath('ffmpeg');
      const { stdout } = await execFileAsync(ffmpegBin, ['-encoders'], { timeout: 8000 });

      qsvAvailable = stdout.includes('h264_qsv');
      nvencAvailable = stdout.includes('h264_nvenc');
      amfAvailable = stdout.includes('h264_amf');

      if (nvencAvailable) {
        gpuVendor = 'nvidia';
      } else if (qsvAvailable) {
        gpuVendor = 'intel';
      } else if (amfAvailable) {
        gpuVendor = 'amd';
      }
    } catch (err: any) {
      console.warn(`[ComputeScheduler]: FFmpeg encoder probe failed (${err.message}). Defaulting to CPU libx264.`);
    }

    // Configurable slot allocations
    const envGpuSlots = process.env.MAX_GPU_RENDER_SLOTS ? parseInt(process.env.MAX_GPU_RENDER_SLOTS, 10) : undefined;
    const envCpuSlots = process.env.MAX_CPU_RENDER_SLOTS ? parseInt(process.env.MAX_CPU_RENDER_SLOTS, 10) : undefined;

    // By default: 1 GPU slot on Intel integrated graphics, 2 on discrete; 2 CPU slots for libx264
    const maxGpuSlots = envGpuSlots ?? (gpuVendor === 'intel' ? 1 : gpuVendor === 'nvidia' ? 2 : 1);
    const maxCpuSlots = envCpuSlots ?? Math.max(1, Math.min(4, Math.floor(cpuCores / 4)));
    const threadsPerCpuSlot = Math.max(2, Math.floor(cpuCores / maxCpuSlots));

    // Force override via EXCERPT_ENCODER_BACKEND if specified
    const forcedBackend = process.env.EXCERPT_ENCODER_BACKEND as EncoderBackend | undefined;
    let recommendedBackend: EncoderBackend = 'libx264';

    if (forcedBackend && ['h264_qsv', 'h264_nvenc', 'h264_amf', 'libx264'].includes(forcedBackend)) {
      recommendedBackend = forcedBackend;
    } else if (qsvAvailable) {
      // Empirically validated on Excerpt full filtergraph: 2.42x-3.64x speedup, 0 regressions
      recommendedBackend = 'h264_qsv';
    } else if (nvencAvailable) {
      recommendedBackend = 'h264_nvenc';
    } else {
      recommendedBackend = 'libx264';
    }

    this.gpuLimiter = pLimit(maxGpuSlots);
    this.cpuLimiter = pLimit(maxCpuSlots);

    const detected: RenderCapabilities = {
      cpuCores,
      cpuModel,
      ramBytes,
      ramFreeBytes,
      gpuVendor,
      qsvAvailable,
      nvencAvailable,
      amfAvailable,
      maxGpuSlots,
      maxCpuSlots,
      threadsPerCpuSlot,
      recommendedBackend,
    };

    console.log('[ComputeScheduler]: 🖥️ Hardware capabilities initialized:', {
      cpu: `${cpuModel} (${cpuCores} cores)`,
      ram: `${(ramBytes / 1024 / 1024 / 1024).toFixed(1)} GB (${(ramFreeBytes / 1024 / 1024 / 1024).toFixed(1)} GB free)`,
      gpu: `${gpuVendor.toUpperCase()} (QSV: ${qsvAvailable}, NVENC: ${nvencAvailable}, AMF: ${amfAvailable})`,
      slots: `CPU: ${maxCpuSlots} (threads: ${threadsPerCpuSlot}), GPU: ${maxGpuSlots}`,
      defaultBackend: recommendedBackend,
    });

    return detected;
  }

  /**
   * Executes a render task within a managed compute slot (GPU or CPU).
   * Prevents uncontrolled process spawning and CPU/GPU cache thrashing.
   */
  public async withSlot<T>(backend: EncoderBackend, task: () => Promise<T>): Promise<T> {
    const caps = await this.getCapabilities();
    const isGpu = backend === 'h264_qsv' || backend === 'h264_nvenc' || backend === 'h264_amf';

    const limiter = isGpu ? (this.gpuLimiter || pLimit(caps.maxGpuSlots)) : (this.cpuLimiter || pLimit(caps.maxCpuSlots));

    return limiter(async () => {
      if (isGpu) this.activeGpuJobs++;
      else this.activeCpuJobs++;

      try {
        return await task();
      } finally {
        if (isGpu) this.activeGpuJobs--;
        else this.activeCpuJobs--;
      }
    });
  }

  /**
   * Generates calibrated FFmpeg encode flags for the selected backend and mode.
   */
  public getEncodeArgs(backend: EncoderBackend, mode: GenerationMode, threadsOverride?: number): string[] {
    const isDraft = mode === 'draft';
    const threads = threadsOverride ?? this.capabilities?.threadsPerCpuSlot ?? 4;

    switch (backend) {
      case 'h264_qsv':
        return [
          '-c:v', 'h264_qsv',
          '-preset', isDraft ? 'veryfast' : 'medium',
          '-global_quality', isDraft ? '28' : '23',
          '-look_ahead', isDraft ? '0' : '1',
          '-pix_fmt', 'nv12',
          '-c:a', 'aac',
          '-b:a', isDraft ? '192k' : '320k',
          '-ar', '48000',
          '-movflags', '+faststart',
        ];

      case 'h264_nvenc':
        return [
          '-c:v', 'h264_nvenc',
          '-preset', isDraft ? 'p4' : 'p6',
          '-cq', isDraft ? '24' : '19',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', isDraft ? '192k' : '320k',
          '-ar', '48000',
          '-movflags', '+faststart',
        ];

      case 'h264_amf':
        return [
          '-c:v', 'h264_amf',
          '-quality', isDraft ? 'speed' : 'quality',
          '-rc', 'cqp',
          '-qp_i', isDraft ? '26' : '20',
          '-qp_p', isDraft ? '26' : '20',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', isDraft ? '192k' : '320k',
          '-ar', '48000',
          '-movflags', '+faststart',
        ];

      case 'libx264':
      default:
        return [
          '-c:v', 'libx264',
          '-preset', isDraft ? 'veryfast' : 'fast',
          '-crf', isDraft ? '22' : '18',
          '-threads', String(threads),
          '-maxrate', isDraft ? '8M' : '12M',
          '-bufsize', isDraft ? '12M' : '16M',
          '-profile:v', 'high',
          '-level', '4.2',
          '-pix_fmt', 'yuv420p',
          '-color_primaries', 'bt709',
          '-color_trc', 'bt709',
          '-colorspace', 'bt709',
          '-vsync', 'cfr',
          '-g', '60',
          '-keyint_min', '60',
          '-c:a', 'aac',
          '-b:a', isDraft ? '192k' : '320k',
          '-ar', '48000',
          '-movflags', '+faststart',
        ];
    }
  }
}

export const computeScheduler = ComputeScheduler.getInstance();
