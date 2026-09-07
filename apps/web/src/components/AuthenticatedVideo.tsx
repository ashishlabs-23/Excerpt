"use client";

import React, { forwardRef, useEffect, useRef, useState } from "react";
import { getClipPlayUrl } from "@/lib/api";

export type AuthenticatedVideoProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  clipId: string;
  fallbackSrc?: string;
  /** If true, fetch the play token immediately on mount (for modal/autoplay use). Default: false (lazy on first play/hover). */
  eager?: boolean;
};

function isValidDirectUrl(url?: string): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

export const AuthenticatedVideo = forwardRef<HTMLVideoElement, AuthenticatedVideoProps>(
  function AuthenticatedVideo({ clipId, fallbackSrc, eager = false, ...videoProps }, ref) {
    const internalRef = useRef<HTMLVideoElement | null>(null);
    // Prioritize direct cloud/B2/S3 signed URL immediately for 0ms latency & native CDN streaming
    const directUrl = isValidDirectUrl(fallbackSrc) ? fallbackSrc! : null;
    const [src, setSrc] = useState<string | null>(directUrl);
    const [error, setError] = useState(false);
    const [isLoading, setIsLoading] = useState(!directUrl && eager);
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
          // If the user is still hovering when the stream URL arrives, trigger muted playback
          if (isHoveredRef.current && internalRef.current) {
            internalRef.current.muted = true;
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
      // If direct URL is present, use it directly (matching Voiceover Studio speed)
      if (isValidDirectUrl(fallbackSrc)) {
        setSrc(fallbackSrc!);
        setError(false);
        setIsLoading(false);
        return;
      }
      if (!clipId) {
        if (fallbackSrc) setSrc(fallbackSrc);
        return;
      }
      if (eager && !src) {
        fetchPlayUrl();
      }
    }, [clipId, fallbackSrc, eager]);

    // When src is populated, if eager or autoPlay, kick off playback with fallback to muted
    useEffect(() => {
      if (src && internalRef.current && (eager || videoProps.autoPlay)) {
        const video = internalRef.current;
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Autoplay without user interaction was blocked, switch to muted autoplay
            video.muted = true;
            video.play().catch(() => {});
          });
        }
      }
    }, [src, eager, videoProps.autoPlay]);

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
          // If direct URL failed (e.g. expired signed URL), fall back to fetching fresh play token URL
          if (clipId && src === fallbackSrc && !fetchingRef.current) {
            console.warn('[AuthenticatedVideo] Direct signed URL failed, requesting fresh stream token for', clipId);
            fetchPlayUrl();
            return;
          }
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
