"use client";

import React, { forwardRef, useEffect, useRef, useState } from "react";
import { getClipPlayUrl } from "@/lib/api";

export type AuthenticatedVideoProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  clipId: string;
  fallbackSrc?: string;
  /** If true, fetch the play token immediately on mount (for modal/autoplay use). Default: false (lazy on first play/hover). */
  eager?: boolean;
};

export const AuthenticatedVideo = forwardRef<HTMLVideoElement, AuthenticatedVideoProps>(
  function AuthenticatedVideo({ clipId, fallbackSrc, eager = false, ...videoProps }, ref) {
    const internalRef = useRef<HTMLVideoElement | null>(null);
    const [src, setSrc] = useState<string | null>(null);
    const [error, setError] = useState(false);
    const [isLoading, setIsLoading] = useState(eager);
    const isHoveredRef = useRef(false);
    const fetchingRef = useRef(false);

    // Merge forwarded ref with internal ref so ref is always the true HTMLVideoElement
    const setRefs = (node: HTMLVideoElement | null) => {
      internalRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLVideoElement | null>).current = node;
      }
    };

    const fetchPlayUrl = async () => {
      if (fetchingRef.current || !clipId) return;
      fetchingRef.current = true;
      setIsLoading(true);
      try {
        const playUrl = await getClipPlayUrl(clipId);
        if (playUrl) {
          setSrc(playUrl);
          setError(false);
          // If the user is still hovering when the stream URL arrives, trigger playback
          if (isHoveredRef.current && internalRef.current) {
            internalRef.current.play().catch(() => {});
          }
        }
      } catch {
        if (fallbackSrc) {
          setSrc(fallbackSrc);
          setError(false);
        } else {
          setError(true);
        }
      } finally {
        fetchingRef.current = false;
        setIsLoading(false);
      }
    };

    useEffect(() => {
      if (!clipId) {
        if (fallbackSrc) setSrc(fallbackSrc);
        return;
      }
      if (eager) {
        fetchPlayUrl();
      }
    }, [clipId, fallbackSrc, eager]);

    if (error && !src) {
      return (
        <div
          className={`w-full h-full bg-black/60 flex items-center justify-center text-xs text-white/30 ${
            videoProps.className || ""
          }`}
        >
          Video Unavailable
        </div>
      );
    }

    const videoClasses = `${videoProps.className || ""} ${
      isLoading && !src ? "animate-pulse bg-black/40" : ""
    }`.trim();

    return (
      <video
        {...videoProps}
        ref={setRefs}
        className={videoClasses}
        src={src || undefined}
        onMouseEnter={(e) => {
          isHoveredRef.current = true;
          if (!src) fetchPlayUrl();
          if (videoProps.onMouseEnter) videoProps.onMouseEnter(e);
        }}
        onMouseOver={(e) => {
          isHoveredRef.current = true;
          if (!src) {
            fetchPlayUrl();
          } else {
            if (videoProps.onMouseOver) videoProps.onMouseOver(e);
          }
        }}
        onMouseLeave={(e) => {
          isHoveredRef.current = false;
          if (videoProps.onMouseLeave) videoProps.onMouseLeave(e);
        }}
        onMouseOut={(e) => {
          isHoveredRef.current = false;
          if (videoProps.onMouseOut) videoProps.onMouseOut(e);
        }}
        onPlay={async (e) => {
          if (videoProps.onPlay) videoProps.onPlay(e);
          if (!src && !fetchingRef.current) {
            internalRef.current?.pause();
            await fetchPlayUrl();
            internalRef.current?.play().catch(() => {});
          }
        }}
        onError={(e) => {
          if (fallbackSrc && src !== fallbackSrc) {
            setSrc(fallbackSrc);
            setError(false);
          } else {
            setError(true);
          }
          if (videoProps.onError) videoProps.onError(e);
        }}
      />
    );
  },
);
