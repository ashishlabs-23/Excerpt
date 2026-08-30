export type VideoJobStatus = 
  | 'created'
  | 'queued'
  | 'acquiring'
  | 'analyzing'
  | 'downloading'
  | 'transcribing'
  | 'perceiving'
  | 'generating_candidates'
  | 'ranking'
  | 'planning'
  | 'rendering'
  | 'validating_delivery'
  | 'validating_playback'
  | 'completed'
  | 'completed:partial'
  | 'failed'
  | 'failed:download'
  | 'failed:transcription'
  | 'failed:perception'
  | 'failed:candidate_generation'
  | 'failed:no_viable_clips'
  | 'failed:ranking'
  | 'failed:planning'
  | 'failed:render'
  | 'failed:delivery_validation'
  | 'failed:playback_validation'
  | 'failed:artifact_unusable'
  | 'failed:persistence'
  | 'dead_letter';

export interface FinalDeliveryReport {
  requested: number;
  accepted: number;
  scheduled: number;
  rendered: number;
  uploaded: number;
  verified: number;
  playable: number;
}

export interface VideoJob {
  id: string;
  userId?: string;
  tenantId?: string;
  correlationId?: string;
  status: VideoJobStatus;
  inputUrl?: string;
  videoUrl?: string;
  requestedClips: number;
  rankingCriteria?: Record<string, any>;
  outputSpec?: Record<string, any>;
  childJobIds?: string[];
  artifacts?: any[];
  resumeFrom?: VideoJobStatus;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  progress?: number;
  error?: string | null;
  [key: string]: any;
}
