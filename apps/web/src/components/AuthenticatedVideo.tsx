"use client";

import React, { forwardRef, useEffect, useState } from "react";
import { getClipPlayUrl } from "@/lib/api";

type AuthenticatedVideoProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  clipId: string;
  fallbackSrc?: string;
};

export const AuthenticatedVideo = forwardRef<HTMLVideoElement, AuthenticatedVideoProps>(
  function AuthenticatedVideo({ clipId, fallbackSrc, ...videoProps }, ref) {
    const [src, setSrc] = useState<string | null>(fallbackSrc || null);
    const [error, setError] = useState(false);

    useEffect(() => {
      let cancelled = false;

      // If we don't have a clipId, use fallbackSrc directly
      if (!clipId) {
        if (fallbackSrc) setSrc(fallbackSrc);
        return;
      }

      getClipPlayUrl(clipId)
        .then((playUrl) => {
          if (!cancelled && playUrl) {
            setSrc(playUrl);
            setError(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            if (fallbackSrc) {
              setSrc(fallbackSrc);
              setError(false);
            } else {
              setError(true);
            }
          }
        });

      return () => {
        cancelled = true;
      };
    }, [clipId, fallbackSrc]);

    if (error && !src) {
      return <div className="w-full h-full bg-black/60 flex items-center justify-center text-xs text-white/30">Video Unavailable</div>;
    }

    if (!src) {
      return <div className="w-full h-full bg-black/40 animate-pulse" />;
    }

    return (
      <video
        {...videoProps}
        ref={ref}
        src={src}
        onError={(e) => {
          if (fallbackSrc && src !== fallbackSrc) {
            setSrc(fallbackSrc);
            setError(false);
          } else {
            setError(true);
          }
          if (videoProps.onError) {
            videoProps.onError(e);
          }
        }}
      />
    );
  },
);
