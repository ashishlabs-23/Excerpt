import React from 'react';
import { VideoJob } from '@excerpt/clipping-core';
import { ClipArtifact, VideoPlayer } from './VideoPlayer';
import { EmptyState } from '../primitives/EmptyState';

export interface RecentClipsProps {
  job?: VideoJob;
  clips: ClipArtifact[];
  requestedCount?: number;
  onCreateJob?: () => void;
  onRefreshPresignedUrl?: (clipId: string) => Promise<string>;
}

export const RecentClips: React.FC<RecentClipsProps> = ({
  job,
  clips,
  requestedCount = 0,
  onCreateJob,
  onRefreshPresignedUrl
}) => {
  // 1. Empty Gallery State
  if (!clips || clips.length === 0) {
    return (
      <EmptyState
        title="No Clips Available"
        description="Your clip gallery is empty. Create a new processing job to generate short clips."
        actionLabel="Create Your First Clip"
        onAction={onCreateJob}
        icon="🎬"
      />
    );
  }

  const isPartial = job?.status === 'completed:partial';
  const totalRequested = requestedCount || job?.requestedClips || clips.length;
  const readyCount = clips.length;
  const missingCount = Math.max(0, totalRequested - readyCount);

  return (
    <div className="space-y-6 my-8">
      {/* Partial Success Explicit Banner */}
      {isPartial && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200 space-y-1">
          <div className="flex justify-between items-center font-bold text-sm text-amber-300">
            <span>⚠️ Partial Delivery Status</span>
            <span>{readyCount} of {totalRequested} Clips Ready</span>
          </div>
          <p className="text-amber-200/80 leading-relaxed">
            {missingCount} requested {missingCount === 1 ? 'clip' : 'clips'} failed final delivery/playback validation checks. Only verified usable clips are displayed below.
          </p>
        </div>
      )}

      {/* Clip Grid / List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {clips.map((clip) => (
          <div key={clip.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            {/* Lazy-Loaded Thumbnail with Descriptive Alt Text */}
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-950">
              <img
                src={clip.thumbnailUrl}
                alt={`Thumbnail preview for ${clip.title}`}
                loading="lazy"
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-slate-200">
                {clip.durationSeconds.toFixed(1)}s
              </span>
            </div>

            {/* Player Component */}
            <VideoPlayer clip={clip} onRefreshPresignedUrl={onRefreshPresignedUrl} />
          </div>
        ))}
      </div>
    </div>
  );
};
