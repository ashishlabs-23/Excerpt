import { VideoJobStatus } from '@excerpt/clipping-core';

export type JobStatusCategory = 
  | 'in_progress'
  | 'success'
  | 'partial_success'
  | 'failure'
  | 'needs_attention';

export type JobStatusVariant = 
  | 'success'      // Emerald/Green
  | 'warning'      // Amber/Yellow
  | 'error'        // Red/Rose
  | 'attention'    // Purple/Indigo
  | 'info'         // Cyan/Sky
  | 'progress';    // Blue/Indigo (animated)

export interface JobStatusMeta {
  status: VideoJobStatus;
  label: string;
  category: JobStatusCategory;
  variant: JobStatusVariant;
  icon: string; // Enforces WCAG AA: Color is paired with an explicit visual icon
  description: string;
}

export const ALL_VIDEO_JOB_STATUSES: VideoJobStatus[] = [
  'created',
  'queued',
  'acquiring',
  'analyzing',
  'downloading',
  'transcribing',
  'perceiving',
  'generating_candidates',
  'ranking',
  'planning',
  'rendering',
  'validating_delivery',
  'validating_playback',
  'completed',
  'completed:partial',
  'failed',
  'failed:download',
  'failed:transcription',
  'failed:perception',
  'failed:candidate_generation',
  'failed:no_viable_clips',
  'failed:ranking',
  'failed:planning',
  'failed:render',
  'failed:delivery_validation',
  'failed:playback_validation',
  'failed:artifact_unusable',
  'failed:persistence',
  'dead_letter'
];

export const JOB_STATUS_MAP: Record<VideoJobStatus, JobStatusMeta> = {
  // In-Progress States
  created: {
    status: 'created',
    label: 'Job Queued',
    category: 'in_progress',
    variant: 'info',
    icon: '⏳',
    description: 'Job accepted and awaiting assignment to an ingestion worker.'
  },
  queued: {
    status: 'queued',
    label: 'Queued in Buffer',
    category: 'in_progress',
    variant: 'info',
    icon: '⏳',
    description: 'Job placed in distributed message queue.'
  },
  acquiring: {
    status: 'acquiring',
    label: 'Acquiring Media',
    category: 'in_progress',
    variant: 'progress',
    icon: '⬇️',
    description: 'Acquiring video stream and extracting audio.'
  },
  analyzing: {
    status: 'analyzing',
    label: 'Analyzing Content',
    category: 'in_progress',
    variant: 'progress',
    icon: '🧠',
    description: 'Running AI perceptual, story, and ranking evaluation.'
  },
  downloading: {
    status: 'downloading',
    label: 'Downloading Media',
    category: 'in_progress',
    variant: 'progress',
    icon: '⏳',
    description: 'Fetching source video payload from URL.'
  },
  transcribing: {
    status: 'transcribing',
    label: 'Transcribing Audio',
    category: 'in_progress',
    variant: 'progress',
    icon: '⏳',
    description: 'Generating word-level transcript via Speech-to-Text.'
  },
  perceiving: {
    status: 'perceiving',
    label: 'Analyzing Perception',
    category: 'in_progress',
    variant: 'progress',
    icon: '⏳',
    description: 'Extracting visual and audio perception features.'
  },
  generating_candidates: {
    status: 'generating_candidates',
    label: 'Generating Clips',
    category: 'in_progress',
    variant: 'progress',
    icon: '⏳',
    description: 'Identifying potential clip boundaries.'
  },
  ranking: {
    status: 'ranking',
    label: 'Ranking Candidates',
    category: 'in_progress',
    variant: 'progress',
    icon: '⏳',
    description: 'Multi-Agent debate and scoring candidates.'
  },
  planning: {
    status: 'planning',
    label: 'Planning Camera & Captions',
    category: 'in_progress',
    variant: 'progress',
    icon: '⏳',
    description: 'Generating framing and kinetic caption plans.'
  },
  rendering: {
    status: 'rendering',
    label: 'Rendering Video',
    category: 'in_progress',
    variant: 'progress',
    icon: '⏳',
    description: 'FFmpeg multi-clip rendering in progress.'
  },
  validating_delivery: {
    status: 'validating_delivery',
    label: 'Validating Storage',
    category: 'in_progress',
    variant: 'info',
    icon: 'ℹ️',
    description: 'Checking artifact upload integrity.'
  },
  validating_playback: {
    status: 'validating_playback',
    label: 'Validating Playback',
    category: 'in_progress',
    variant: 'info',
    icon: 'ℹ️',
    description: 'Verifying HTTP Range seekability and header format.'
  },

  // Terminal Success States
  completed: {
    status: 'completed',
    label: 'All Clips Ready',
    category: 'success',
    variant: 'success',
    icon: '✔',
    description: 'All requested clips rendered and fully validated.'
  },

  // Terminal Partial Success (DISTINCT FROM COMPLETED!)
  'completed:partial': {
    status: 'completed:partial',
    label: 'Partial Delivery',
    category: 'partial_success',
    variant: 'warning',
    icon: '⚠️',
    description: 'Some clips succeeded, but one or more clips failed validation.'
  },

  // Terminal Failure States
  'failed:download': {
    status: 'failed:download',
    label: 'Download Failed',
    category: 'failure',
    variant: 'error',
    icon: '✖',
    description: 'Unable to fetch source media. Check URL accessibility.'
  },
  'failed:transcription': {
    status: 'failed:transcription',
    label: 'Transcription Failed',
    category: 'failure',
    variant: 'error',
    icon: '✖',
    description: 'Speech-to-Text provider failed to transcribe audio.'
  },
  'failed:perception': {
    status: 'failed:perception',
    label: 'Perception Failed',
    category: 'failure',
    variant: 'error',
    icon: '✖',
    description: 'Vision/Audio perception analysis encountered an error.'
  },
  'failed:candidate_generation': {
    status: 'failed:candidate_generation',
    label: 'Generation Failed',
    category: 'failure',
    variant: 'error',
    icon: '✖',
    description: 'Failed to process candidate boundary signals.'
  },
  'failed:no_viable_clips': {
    status: 'failed:no_viable_clips',
    label: 'No Viable Clips',
    category: 'failure',
    variant: 'warning',
    icon: '⚠️',
    description: 'Source media contained no clips meeting quality thresholds.'
  },
  'failed:ranking': {
    status: 'failed:ranking',
    label: 'Ranking Failed',
    category: 'failure',
    variant: 'error',
    icon: '✖',
    description: 'Multi-objective ranking engine failed to rank candidates.'
  },
  'failed:planning': {
    status: 'failed:planning',
    label: 'Planning Failed',
    category: 'failure',
    variant: 'error',
    icon: '✖',
    description: 'Director AI failed to generate camera/caption plan.'
  },
  'failed:render': {
    status: 'failed:render',
    label: 'Render Engine Error',
    category: 'failure',
    variant: 'error',
    icon: '✖',
    description: 'FFmpeg render jobs failed to render video output.'
  },
  'failed:delivery_validation': {
    status: 'failed:delivery_validation',
    label: 'Delivery Validation Error',
    category: 'failure',
    variant: 'error',
    icon: '✖',
    description: 'Artifact failed storage checksum validation.'
  },
  'failed:playback_validation': {
    status: 'failed:playback_validation',
    label: 'Playback Validation Error',
    category: 'failure',
    variant: 'error',
    icon: '✖',
    description: 'Rendered video artifact failed HTTP Range seekability check.'
  },
  'failed:artifact_unusable': {
    status: 'failed:artifact_unusable',
    label: 'Artifact Unusable',
    category: 'failure',
    variant: 'error',
    icon: '✖',
    description: 'Output media header corrupted or unplayable.'
  },
  'failed:persistence': {
    status: 'failed:persistence',
    label: 'Database Error',
    category: 'failure',
    variant: 'error',
    icon: '✖',
    description: 'Failed to persist job transaction to database.'
  },
  failed: {
    status: 'failed',
    label: 'Job Failed',
    category: 'failure',
    variant: 'error',
    icon: '✖',
    description: 'Processing encountered an error and could not complete.'
  },

  // Escalated Dead Letter State (DISTINCT FROM ORDINARY FAILURE!)
  dead_letter: {
    status: 'dead_letter',
    label: 'Escalated / Exhausted',
    category: 'needs_attention',
    variant: 'attention',
    icon: '🚨',
    description: 'All automatic retries exhausted. Job requires support investigation.'
  }
};

export function getJobStatusMeta(status: VideoJobStatus): JobStatusMeta {
  const meta = JOB_STATUS_MAP[status];
  if (!meta) {
    throw new Error(`UNMAPPED_JOB_STATUS: VideoJobStatus '${status}' has no entry in JOB_STATUS_MAP`);
  }
  return meta;
}
