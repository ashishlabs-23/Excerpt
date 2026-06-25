'use client';

import React, { useRef, useEffect } from 'react';

export function ArenaVideoPlayer({ src, label, onPlay, onPause }: { src: string, label: string, onPlay: () => void, onPause: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.addEventListener('play', onPlay);
      video.addEventListener('pause', onPause);
      return () => {
        video.removeEventListener('play', onPlay);
        video.removeEventListener('pause', onPause);
      };
    }
  }, [onPlay, onPause]);

  return (
    <div className="flex flex-col items-center p-4 bg-gray-900 rounded-lg shadow-lg">
      <div className="text-gray-400 font-bold mb-2 tracking-widest">{label}</div>
      <video 
        ref={videoRef}
        src={src} 
        controls 
        className="w-full max-w-sm rounded"
        preload="metadata"
      />
    </div>
  );
}
