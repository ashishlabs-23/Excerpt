'use client';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Maximize2, Volume2, VolumeX, Volume1, Heart, MessageCircle, Share2, Music, Bookmark } from 'lucide-react';

interface VideoPlayerProps {
  src: string;
  title: string;
  startTime: number;
  endTime: number;
  onTimeUpdate?: (time: number) => void;
  onLoadedMetadata?: (duration: number) => void;
  manualSeekTime?: number | null;
  showCaptions?: boolean;
  faceCentering?: boolean;
  words?: Array<{ word: string; start: number; end: number }>;
  excludedWordIndices?: Set<number>;
  captionStyle?: string;
  cropOffset?: number;
  socialPreviewMode?: 'tiktok' | 'youtube' | 'instagram' | 'none';
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  title,
  startTime,
  endTime,
  onTimeUpdate,
  onLoadedMetadata,
  manualSeekTime,
  showCaptions = true,
  faceCentering = true,
  words = [],
  excludedWordIndices = new Set(),
  captionStyle = 'Submagic',
  cropOffset = 0,
  socialPreviewMode = 'none',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(2); // default 1x
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingProgress = useRef(false);

  const clipDuration = endTime - startTime;
  const progress = clipDuration > 0 ? Math.max(0, Math.min(1, (currentTime - startTime) / clipDuration)) : 0;

  // -- Exclusions / skipped intervals logic --
  const excludedIntervals = React.useMemo(() => {
    if (!words || words.length === 0 || excludedWordIndices.size === 0) return [];
    const intervals: Array<{ start: number; end: number }> = [];
    let start: number | null = null;
    let end: number | null = null;

    for (let i = 0; i < words.length; i++) {
      if (excludedWordIndices.has(i)) {
        if (start === null) {
          start = words[i].start;
        }
        end = words[i].end;
      } else {
        if (start !== null && end !== null) {
          intervals.push({ start, end });
          start = null;
          end = null;
        }
      }
    }
    if (start !== null && end !== null) {
      intervals.push({ start, end });
    }
    return intervals;
  }, [words, excludedWordIndices]);

  // -- Caption logic --
  const phrases = React.useMemo(() => {
    const activeWords = words.filter((_, idx) => !excludedWordIndices.has(idx));
    if (activeWords.length === 0) return [];
    const result: Array<{ words: typeof activeWords; start: number; end: number }> = [];
    let group: typeof activeWords = [];
    for (let i = 0; i < activeWords.length; i++) {
      const w = activeWords[i];
      group.push(w);
      const hasPunct = /[.,!?;:]/.test(w.word);
      const nextW = activeWords[i + 1];
      const isGap = nextW ? nextW.start - w.end > 0.45 : false;
      if (isGap || group.length >= 4 || hasPunct || !nextW) {
        result.push({ words: group, start: group[0].start, end: group[group.length - 1].end });
        group = [];
      }
    }
    return result;
  }, [words, excludedWordIndices]);

  const activeWord = words.find(w => currentTime >= w.start && currentTime <= w.end);
  const activePhrase = phrases.find(p => currentTime >= p.start && currentTime <= p.end);

  // -- Time event listeners --
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdateHandler = () => {
      const time = video.currentTime;
      setCurrentTime(time);

      const activeExclude = excludedIntervals.find(interval => time >= interval.start && time < interval.end);
      if (activeExclude) {
        video.currentTime = activeExclude.end;
        return;
      }

      if (time >= endTime) {
        video.currentTime = startTime;
        video.pause();
        setIsPlaying(false);
      }
    };
    const onMeta = () => {
      setCurrentTime(video.currentTime);
      if (onLoadedMetadata) onLoadedMetadata(video.duration);
      video.currentTime = startTime;
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);

    video.addEventListener('timeupdate', onTimeUpdateHandler);
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdateHandler);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [startTime, endTime, onLoadedMetadata, excludedIntervals]);

  // Propagate time to parent
  useEffect(() => {
    if (onTimeUpdate) onTimeUpdate(currentTime);
  }, [currentTime, onTimeUpdate]);

  // External seek
  useEffect(() => {
    if (manualSeekTime !== null && manualSeekTime !== undefined && videoRef.current) {
      videoRef.current.currentTime = manualSeekTime;
    }
  }, [manualSeekTime]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.code === 'ArrowRight') { e.preventDefault(); seek(Math.min(endTime, (videoRef.current?.currentTime || startTime) + 5)); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); seek(Math.max(startTime, (videoRef.current?.currentTime || startTime) - 5)); }
      if (e.code === 'KeyM') { toggleMute(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [startTime, endTime, togglePlay]);

  const seek = (time: number) => {
    if (videoRef.current) videoRef.current.currentTime = time;
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    setIsMuted(next);
    videoRef.current.muted = next;
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    if (videoRef.current) {
      videoRef.current.volume = v;
      if (v === 0) setIsMuted(true);
      else if (isMuted) {
        setIsMuted(false);
        videoRef.current.muted = false;
      }
    }
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % PLAYBACK_SPEEDS.length;
    setSpeedIdx(next);
    if (videoRef.current) videoRef.current.playbackRate = PLAYBACK_SPEEDS[next];
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleProgressInteraction = useCallback((clientX: number) => {
    if (!progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seek(startTime + pct * clipDuration);
  }, [startTime, clipDuration]);

  const onProgressMouseDown = (e: React.MouseEvent) => {
    isDraggingProgress.current = true;
    handleProgressInteraction(e.clientX);
    const onMove = (ev: MouseEvent) => { if (isDraggingProgress.current) handleProgressInteraction(ev.clientX); };
    const onUp = () => { isDraggingProgress.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const resetHideTimer = () => {
    setShowControls(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => { if (isPlaying) setShowControls(false); }, 3000);
  };

  const formatTime = (t: number) => {
    const s = Math.max(0, t);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const getWordStyle = (isActive: boolean) => {
    switch (captionStyle) {
      case 'TikTok':
        return {
          color: isActive ? '#facc15' : '#ffffff',
          transform: isActive ? 'scale(1.2)' : 'scale(1)',
          fontFamily: 'Impact, sans-serif',
          textShadow: '2px 2px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000',
        };
      case 'Hormozi':
        return {
          color: isActive ? '#eab308' : '#ffffff',
          transform: isActive ? 'scale(1.15) rotate(-3deg)' : 'scale(1)',
          fontFamily: 'sans-serif',
          fontWeight: 900,
          textShadow: '2px 2px 0px #000, -2px -2px 0px #000',
        };
      case 'MrBeast':
        return {
          color: isActive ? '#22c55e' : '#facc15',
          transform: isActive ? 'scale(1.25) rotate(4deg)' : 'scale(1)',
          fontFamily: 'Impact, sans-serif',
          fontWeight: 950,
          textShadow: '3px 3px 0px #000',
        };
      case 'Minimal':
        return {
          color: isActive ? '#ffffff' : 'rgba(255,255,255,0.4)',
          transform: 'none',
          fontFamily: 'sans-serif',
          fontWeight: 500,
          textShadow: 'none',
        };
      case 'Submagic':
      default:
        return {
          color: isActive ? '#ec4899' : '#ffffff',
          transform: isActive ? 'scale(1.12)' : 'scale(1)',
          fontFamily: 'sans-serif',
          fontWeight: 800,
          textShadow: '0 2px 10px rgba(0,0,0,0.8)',
        };
    }
  };

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-auto aspect-[9/16] mx-auto bg-black rounded-[2.5rem] overflow-hidden border-[10px] border-[#111827] shadow-[0_40px_120px_rgba(0,0,0,0.9)] group select-none"
      onMouseMove={resetHideTimer}
      onMouseLeave={() => { if (isPlaying) setShowControls(false); }}
    >
      {/* Video */}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-cover"
        style={{ objectPosition: `${50 + cropOffset}% 50%` }}
        playsInline
        onClick={togglePlay}
      />

      {/* ── Captions Overlay ── */}
      {showCaptions && activePhrase && activeWord && (
        <div className="absolute bottom-[22%] left-0 right-0 flex justify-center pointer-events-none z-20 px-3">
          <div className="px-4 py-2 bg-black/70 backdrop-blur-md rounded-2xl shadow-2xl flex flex-wrap justify-center gap-x-2 gap-y-0.5 max-w-full">
            {activePhrase.words.map((w, idx) => {
              const isActive = w.start === activeWord.start;
              return (
                <span
                  key={idx}
                  className="text-xl sm:text-2xl uppercase tracking-tight transition-all duration-100"
                  style={{
                    display: 'inline-block',
                    ...getWordStyle(isActive),
                  }}
                >
                  {w.word.toUpperCase()}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Social Preview Overlays ── */}
      {socialPreviewMode !== 'none' && (
        <div className="absolute inset-0 z-25 pointer-events-none flex flex-col justify-end bg-black/10">
          {/* Top banner info */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-white text-[10px] font-bold drop-shadow-md">
            <span>Following</span>
            <span className="border-b-2 border-white pb-1">For You</span>
            <span className="opacity-70">Live</span>
          </div>

          {/* Right Action Bar */}
          <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 text-white">
            <div className="flex flex-col items-center gap-1">
              <div className="w-9 h-9 rounded-full bg-white/20 border border-white/40 flex items-center justify-center text-xs font-black">EX</div>
              <span className="text-[9px] drop-shadow">Follow</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <Heart fill="white" size={24} className="text-white drop-shadow" />
              <span className="text-[9px] font-bold drop-shadow">122K</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <MessageCircle fill="white" size={24} className="text-white drop-shadow" />
              <span className="text-[9px] font-bold drop-shadow">4.8K</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <Bookmark fill="white" size={24} className="text-white drop-shadow" />
              <span className="text-[9px] font-bold drop-shadow">12.5K</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <Share2 fill="white" size={22} className="text-white drop-shadow" />
              <span className="text-[9px] font-bold drop-shadow">Share</span>
            </div>
          </div>

          {/* Bottom Description */}
          <div className="absolute left-4 bottom-8 right-16 text-white text-xs space-y-1.5 drop-shadow">
            <p className="font-bold">@excerpt_app</p>
            <p className="opacity-90 line-clamp-2">{title || 'AI Viral Moment #Shorts'}</p>
            <div className="flex items-center gap-2 text-[10px] opacity-75">
              <Music size={10} className="animate-spin" style={{ animationDuration: '4s' }} />
              <span>Original Sound - excerpt_app</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Face Centering Indicator ── */}
      {faceCentering && socialPreviewMode === 'none' && (
        <>
          <div className="absolute top-5 left-0 right-0 flex justify-center z-30 pointer-events-none">
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded-full backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Face Tracking Active</span>
            </div>
          </div>
          <div className="absolute pointer-events-none z-10" style={{ top: '18%', left: '22%', right: '22%', bottom: '20%', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 4 }}>
            {[['top-0 left-0', '-top-0.5 -left-0.5', 'border-t-2 border-l-2'],
              ['top-0 right-0', '-top-0.5 -right-0.5', 'border-t-2 border-r-2'],
              ['bottom-0 left-0', '-bottom-0.5 -left-0.5', 'border-b-2 border-l-2'],
              ['bottom-0 right-0', '-bottom-0.5 -right-0.5', 'border-b-2 border-r-2'],
            ].map(([, pos, border], i) => (
              <div key={i} className={`absolute ${pos} w-4 h-4 border-emerald-400 ${border}`} style={{ borderColor: 'rgba(52,211,153,0.6)' }} />
            ))}
          </div>
        </>
      )}

      {/* ── Center Play/Pause Pulse ── */}
      {!isPlaying && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center z-20 pointer-events-auto bg-transparent"
        >
          <div className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-2xl hover:bg-black/80 transition-all">
            <Play fill="white" size={32} className="translate-x-0.5 text-white" />
          </div>
        </button>
      )}

      {/* ── Controls Bar ── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30 transition-all duration-300"
        style={{ opacity: showControls || !isPlaying ? 1 : 0, pointerEvents: showControls || !isPlaying ? 'auto' : 'none' }}
      >
        {/* Gradient scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none" />

        <div className="relative px-5 pb-5 pt-12 space-y-3">
          {/* Title */}
          <div className="mb-1">
            <p className="text-white font-bold text-sm leading-tight truncate">{title}</p>
            <p className="text-white/40 text-[9px] uppercase tracking-widest font-black">Excerpt AI Clip</p>
          </div>

          {/* Progress bar */}
          <div
            ref={progressRef}
            className="relative h-1.5 rounded-full bg-white/15 cursor-pointer group/prog overflow-visible"
            onMouseDown={onProgressMouseDown}
          >
            <div
              className="h-full rounded-full bg-primary transition-none"
              style={{ width: `${progress * 100}%` }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-lg border-2 border-primary opacity-0 group-hover/prog:opacity-100 transition-opacity"
              style={{ left: `calc(${progress * 100}% - 7px)` }}
            />
          </div>

          {/* Time + speed */}
          <div className="flex items-center justify-between text-[10px] text-white/50 font-bold">
            <span>{formatTime(currentTime - startTime)} / {formatTime(clipDuration)}</span>
            <button
              onClick={cycleSpeed}
              className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-[9px] font-black tracking-wider transition-colors"
            >
              {PLAYBACK_SPEEDS[speedIdx]}×
            </button>
          </div>

          {/* Main controls row */}
          <div className="flex items-center justify-between gap-3">
            {/* Left: skip back */}
            <button
              onClick={() => seek(startTime)}
              className="text-white/60 hover:text-white transition-colors"
              title="Restart (↑)"
            >
              <SkipBack size={20} />
            </button>

            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all flex-shrink-0"
            >
              {isPlaying
                ? <Pause fill="black" size={20} />
                : <Play fill="black" size={20} className="translate-x-0.5" />}
            </button>

            {/* Skip fwd 5s */}
            <button
              onClick={() => seek(Math.min(endTime, (videoRef.current?.currentTime || startTime) + 5))}
              className="text-white/60 hover:text-white transition-colors"
              title="Forward 5s"
            >
              <SkipForward size={20} />
            </button>

            {/* Volume */}
            <div
              className="relative flex items-center gap-1"
              onMouseEnter={() => setShowVolumeSlider(true)}
              onMouseLeave={() => setShowVolumeSlider(false)}
            >
              <button onClick={toggleMute} className="text-white/60 hover:text-white transition-colors">
                <VolumeIcon size={18} />
              </button>
              {showVolumeSlider && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 bg-[#1f2937]/90 backdrop-blur-md rounded-xl px-2 py-3 shadow-xl border border-white/10">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={e => changeVolume(Number(e.target.value))}
                    className="h-20 cursor-pointer accent-primary"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                  />
                  <span className="text-[8px] text-white/40 font-bold">{Math.round((isMuted ? 0 : volume) * 100)}%</span>
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="text-white/60 hover:text-white transition-colors ml-auto"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
