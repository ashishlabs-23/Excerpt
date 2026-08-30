import React from 'react';
import { AuthenticatedVideo } from './AuthenticatedVideo';

export interface ClipArtifact {
  id: string;
  clipIndex: number;
  title: string;
  durationSeconds: number;
  thumbnailUrl: string;
  presignedStorageUrl: string;
  isValidated: boolean;
}

export interface VideoPlayerProps {
  clip: ClipArtifact;
  onRefreshPresignedUrl?: (clipId: string) => Promise<string>;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ clip, onRefreshPresignedUrl }) => {
  const handleRefresh = async () => {
    if (onRefreshPresignedUrl) {
      return onRefreshPresignedUrl(clip.id);
    }
    return clip.presignedStorageUrl;
  };

  return (
    <div className="space-y-3">
      <AuthenticatedVideo
        initialPresignedUrl={clip.presignedStorageUrl}
        clipTitle={clip.title}
        onRefreshUrl={handleRefresh}
      />
      <div className="flex justify-between items-center px-1">
        <div>
          <h3 className="text-base font-bold text-slate-100">{clip.title}</h3>
          <p className="text-xs text-slate-400">Duration: {clip.durationSeconds.toFixed(1)}s</p>
        </div>
        <a
          href={clip.presignedStorageUrl}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center space-x-1"
        >
          <span>⬇️</span>
          <span>Download MP4</span>
        </a>
      </div>
    </div>
  );
};
