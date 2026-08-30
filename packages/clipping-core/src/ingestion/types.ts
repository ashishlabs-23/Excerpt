export interface Logger {
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  debug?(message: string, meta?: any): void;
}

export type MediaSourceType = 'youtube' | 'direct' | 'local';

export interface MediaSource {
  type: MediaSourceType;
  urlOrPath: string;
}

export interface MediaStreamInfo {
  codec: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
}

export interface MediaArtifact {
  sourceType: MediaSourceType;
  originalUrlOrPath: string;
  localPath: string;
  mimeType: string;
  fileSizeBytes: number;
  durationMs: number;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  hasVideoStream: boolean;
  hasAudioStream: boolean;
  hasAudio: boolean; // Computed policy flag: false if no audio stream
  checksumSha256: string;
}

export interface MediaMetadata {
  title?: string;
  description?: string;
  author?: string;
}

export interface InputAdapterConfig {
  maxDurationMs: number;
  maxSizeBytes: number;
  timeoutMs: number;
  outputDirectory: string;
}

export interface InputAdapter {
  acquire(
    source: MediaSource,
    config: InputAdapterConfig,
    logger: Logger
  ): Promise<MediaArtifact>;
}
