"use client";

import React, { forwardRef, useEffect, useState } from "react";
import { getClipPlayUrl } from "@/lib/api";

type AuthenticatedVideoProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  clipId: string;
  fallbackSrc?: string;
};

export const AuthenticatedVideo = forwardRef<HTMLVideoElement, AuthenticatedVideoProps>(
  function AuthenticatedVideo({ clipId, fallbackSrc, ...videoProps }, ref) {
    const [src, setSrc] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
      let cancelled = false;

      getClipPlayUrl(clipId)
        .then((playUrl) => {
          if (!cancelled) setSrc(playUrl);
        })
        .catch(() => {
          if (!cancelled) {
            if (fallbackSrc) {
              setSrc(fallbackSrc);
            } else {
              setError(true);
            }
          }
        });

      return () => {
        cancelled = true;
      };
    }, [clipId, fallbackSrc]);

    if (error) {
      return <div className="w-full h-full bg-black/60" />;
    }

    if (!src) {
      return <div className="w-full h-full bg-black/40 animate-pulse" />;
    }

    return <video {...videoProps} ref={ref} src={src} />;
  },
);
