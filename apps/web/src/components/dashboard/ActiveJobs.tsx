import React from 'react';
import { VideoJob, VideoJobStatus } from '@excerpt/clipping-core';
import { getJobStatusMeta } from '../../lib/jobStatus';
import { useRealtimeSync, ConnectionStatus } from '../../lib/useRealtimeSync';

export interface ActiveJobsProps {
  jobs: VideoJob[];
  onRetryJob?: (jobId: string) => void;
  mockChannelSpy?: { unsubscribe: () => void };
}

const STAGE_ORDER: VideoJobStatus[] = [
  'created',
  'downloading',
  'transcribing',
  'perceiving',
  'generating_candidates',
  'ranking',
  'planning',
  'rendering',
  'validating_delivery',
  'validating_playback',
  'completed'
];

export const ActiveJobCard: React.FC<{ job: VideoJob; onRetryJob?: (id: string) => void; mockChannelSpy?: any }> = ({
  job,
  onRetryJob,
  mockChannelSpy
}) => {
  const meta = getJobStatusMeta(job.status);
  const { connectionStatus } = useRealtimeSync({ jobId: job.id, mockChannelSpy });

  // Calculate current stage index out of 11 pipeline stages
  const currentStageIndex = STAGE_ORDER.indexOf(job.status);
  const totalStages = STAGE_ORDER.length - 1; // 10 active stage steps
  const stagePercentage = currentStageIndex >= 0 
    ? Math.round((currentStageIndex / totalStages) * 100)
    : (meta.category === 'success' || meta.category === 'partial_success' ? 100 : 0);

  // Badge Color Styles mapped strictly via meta.variant
  const variantStyles = {
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    error: 'bg-red-500/10 text-red-400 border-red-500/30',
    attention: 'bg-purple-500/10 text-purple-300 border-purple-500/40 shadow-purple-500/10 shadow-lg',
    info: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    progress: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 animate-pulse'
  };

  return (
    <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 shadow-md space-y-4">
      {/* Realtime Disconnect Warning Banner */}
      {connectionStatus === 'reconnecting' && (
        <div className="px-3 py-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>Realtime connection lost. Reconnecting to live updates...</span>
        </div>
      )}

      {/* Header Row */}
      <div className="flex justify-between items-center">
        <div>
          <h4 className="text-sm font-semibold text-slate-200">Job ID: {job.id}</h4>
          <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{job.inputUrl || 'Direct Upload'}</p>
        </div>

        {/* Badge Rendered Strictly via Shared jobStatus Contract */}
        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${variantStyles[meta.variant]}`}>
          {meta.label}
        </span>
      </div>

      {/* Stage-Level Progress Indicator (For In-Progress Jobs) */}
      {meta.category === 'in_progress' && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Pipeline Stage ({Math.max(1, currentStageIndex + 1)}/10): <strong>{meta.label}</strong></span>
            <span>{stagePercentage}%</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${stagePercentage}%` }} />
          </div>
        </div>
      )}

      {/* Granular Failure Detail Cards */}
      {meta.category === 'failure' && (
        <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/20 text-xs text-red-300 space-y-2">
          <p className="font-medium">Failure Category: {meta.label}</p>
          <p className="text-slate-400">{meta.description}</p>
          {onRetryJob && (
            <button
              onClick={() => onRetryJob(job.id)}
              className="mt-1 px-3 py-1.5 rounded bg-red-900/60 hover:bg-red-800 text-red-200 font-medium transition-colors"
            >
              Retry Job
            </button>
          )}
        </div>
      )}

      {/* Distinct Dead Letter Recovery Card */}
      {meta.category === 'needs_attention' && (
        <div className="p-4 rounded-lg bg-purple-950/40 border border-purple-500/30 text-xs text-purple-200 space-y-2">
          <div className="flex items-center space-x-2 text-purple-300 font-bold text-sm">
            <span>🚨</span>
            <span>Needs Attention — Retries Exhausted</span>
          </div>
          <p className="text-purple-300/80 leading-relaxed">
            All automatic background retries failed for this job. The system has safely isolated it to prevent retry loops.
          </p>
          <div className="pt-1 flex space-x-2">
            <button
              onClick={() => onRetryJob && onRetryJob(job.id)}
              className="px-3 py-1.5 rounded bg-purple-700 hover:bg-purple-600 text-white font-semibold transition-colors"
            >
              Force Manual Override Retry
            </button>
          </div>
        </div>
      )}

      {/* Partial Success Warning Card */}
      {meta.category === 'partial_success' && (
        <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/20 text-xs text-amber-300">
          <p className="font-semibold">⚠️ Partial Clips Delivered</p>
          <p className="text-slate-400 mt-1">Some clips completed rendering, but others failed storage or playback validation. Only verified usable clips are displayed.</p>
        </div>
      )}
    </div>
  );
};

export const ActiveJobs: React.FC<ActiveJobsProps> = ({ jobs, onRetryJob, mockChannelSpy }) => {
  if (!jobs || jobs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-slate-100 mb-4">Active & Recent Video Jobs</h3>
      {jobs.map((job) => (
        <ActiveJobCard key={job.id} job={job} onRetryJob={onRetryJob} mockChannelSpy={mockChannelSpy} />
      ))}
    </div>
  );
};
