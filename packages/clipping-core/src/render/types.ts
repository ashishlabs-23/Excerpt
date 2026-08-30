import { MediaArtifact } from '../ingestion/types';
import { CameraPlan } from '../director/types';
import { CaptionPlan } from '../captions/types';
import { RenderJob as RankingRenderJob } from '../ranking/types';

export interface AudioPlan {
  schemaVersion: string;
  bgmTrack?: string;
  bgmVolumeDb?: number;
  ducking?: boolean;
}

export interface ThumbnailPlan {
  schemaVersion: string;
  timestampMs: number;
  text?: string;
}

export interface ExpectedArtifacts {
  video: boolean;
  audio: boolean;
  thumbnail: boolean;
}

export interface DeliveryPolicy {
  uploadToS3: boolean;
  s3Prefix?: string;
  webhookUrl?: string;
}

export interface RenderPlan {
  jobId: string;
  schemaVersion: string;
  candidateId: string;
  sourceArtifact: MediaArtifact;
  duration: number; // in milliseconds
  cameraPlan: CameraPlan;
  captionPlan: CaptionPlan;
  audioPlan: AudioPlan;
  thumbnailPlan: ThumbnailPlan;
  expectedArtifacts: ExpectedArtifacts;
  deliveryPolicy: DeliveryPolicy;
  renderJobs: RankingRenderJob[];
  planHash: string; // sha256 of the plan's serialized content (excluding this field)
}
