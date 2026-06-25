export enum JobStatus {
  PENDING = 'PENDING',
  VALIDATING = 'VALIDATING',
  UPLOADING = 'UPLOADING',
  PREPROCESSING = 'PREPROCESSING',
  TRANSCRIBING = 'TRANSCRIBING',
  DETECTING_CLIPS = 'DETECTING_CLIPS',
  CUTTING = 'CUTTING',
  ENHANCING = 'ENHANCING',
  STORING = 'STORING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER'
}

export interface Clip {
  id: string;
  start_time: number;
  end_time: number;
  duration: number;
  title: string;
  hook: string;
  score: number;
  video_url: string;
  thumbnail_url?: string;
  metadata?: {
    hashtags?: string[];
    description?: string;
  };
}

export interface Job {
  id: string;
  user_id: string;
  status: JobStatus;
  video_url?: string;
  error_msg?: string;
  retry_count: number;
  metadata?: {
    original_duration?: number;
    filename?: string;
    clips?: Clip[];
  };
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
}
