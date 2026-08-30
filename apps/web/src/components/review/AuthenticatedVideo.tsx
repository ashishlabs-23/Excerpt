import React, { useState } from 'react';

export interface AuthenticatedVideoProps {
  initialPresignedUrl: string;
  clipTitle: string;
  onRefreshUrl?: () => Promise<string>;
}

export const AuthenticatedVideo: React.FC<AuthenticatedVideoProps> = ({
  initialPresignedUrl,
  clipTitle,
  onRefreshUrl
}) => {
  const [videoUrl, setVideoUrl] = useState(initialPresignedUrl);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleVideoError = async () => {
    // Presigned URL expired mid-session
    if (onRefreshUrl && !isRefreshing) {
      setIsRefreshing(true);
      try {
        const freshUrl = await onRefreshUrl();
        setVideoUrl(freshUrl);
        setHasError(false);
      } catch (err) {
        setHasError(true);
      } finally {
        setIsRefreshing(false);
      }
    } else {
      setHasError(true);
    }
  };

  if (hasError) {
    return (
      <div className="w-full aspect-video rounded-xl bg-slate-900 border border-red-500/30 flex flex-col items-center justify-center p-6 text-center">
        <span className="text-2xl mb-2">⚠️</span>
        <p className="text-sm font-semibold text-slate-200">Playback Stream Expired</p>
        <p className="text-xs text-slate-400 mt-1 mb-4">The secure video token has expired. Please refresh the stream.</p>
        {onRefreshUrl && (
          <button
            onClick={handleVideoError}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
          >
            Refresh Secure Stream
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black border border-slate-800 shadow-xl">
      <video
        key={videoUrl}
        src={videoUrl}
        controls
        preload="metadata"
        onError={handleVideoError}
        className="w-full h-full object-contain"
        aria-label={`Playback video stream for ${clipTitle}`}
      />
      {isRefreshing && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center text-xs text-indigo-300 font-medium">
          Refreshing presigned storage URL...
        </div>
      )}
    </div>
  );
};
