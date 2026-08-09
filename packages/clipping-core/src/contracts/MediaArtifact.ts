export type SourceInputType =
  | 'youtube_url'
  | 'direct_mp4_url'
  | 'direct_webm_url'
  | 'uploaded_mp4'
  | 'uploaded_webm'
  | 'uploaded_mov'
  | 'uploaded_mkv'
  | 'uploaded_m4v'
  | 'other_container';

export interface MediaArtifact {
  id: string;
  sourceType: SourceInputType;
  sourceUrl: string;
  storagePath: string;
  localPath: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  hasAudio: boolean;
  sampleRate?: number;
  channels?: number;
  fileSizeBytes: number;
  normalizedPath?: string;
  metadata: Record<string, any>;
}
