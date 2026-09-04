import React, { useRef, useState, useCallback, useMemo } from 'react';
import { Scissors, Music, ZoomIn, ZoomOut, Volume2 } from 'lucide-react';

interface TimelineProps {
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  onTrimChange?: (inPoint: number, outPoint: number) => void;
  words?: Array<{ word: string; start: number; end: number }>;
  excludedWordIndices?: Set<number>;
}

export const Timeline: React.FC<TimelineProps> = ({
  duration,
  currentTime,
  onSeek,
  onTrimChange,
  words = [],
  excludedWordIndices = new Set(),
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [inPoint, setInPoint] = useState(0);          // 0–1 normalised
  const [outPoint, setOutPoint] = useState(1);         // 0–1 normalised
  const [zoom, setZoom] = useState(1);                  // 1–4x
  const [isDragging, setIsDragging] = useState<'head' | 'in' | 'out' | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;

  // Derive cut intervals from excluded word indices
  const cutIntervals = useMemo(() => {
    if (!words.length || excludedWordIndices.size === 0) return [];
    const intervals: Array<{ start: number; end: number; word: string }> = [];
    words.forEach((w, idx) => {
      if (excludedWordIndices.has(idx)) {
        intervals.push({ start: w.start, end: w.end, word: w.word });
      }
    });
    return intervals;
  }, [words, excludedWordIndices]);

  // Generate dynamic waveform bars based on speech density and word timing
  const waveformBars = useMemo(() => {
    const BAR_COUNT = 100;
    if (duration <= 0) return Array(BAR_COUNT).fill({ height: 30, isSpeech: false, isExcluded: false });

    return Array.from({ length: BAR_COUNT }, (_, i) => {
      const t = (i / BAR_COUNT) * duration;
      const matchedWordIdx = words.findIndex(w => t >= w.start && t <= w.end);
      const isSpeech = matchedWordIdx !== -1;
      const isExcluded = isSpeech && excludedWordIndices.has(matchedWordIdx);

      if (isSpeech) {
        // Pseudo-random pseudo-speech variation seeded by word index & bar
        const word = words[matchedWordIdx];
        const seed = (word.word.length * 17 + i * 31) % 45;
        const height = isExcluded ? 20 : 50 + seed;
        return { height, isSpeech: true, isExcluded, word: word.word };
      } else {
        // Pauses / breaths between speech
        const breathVariation = 15 + ((i * 7) % 12);
        return { height: breathVariation, isSpeech: false, isExcluded: false, word: null };
      }
    });
  }, [words, excludedWordIndices, duration]);

  const getPct = (clientX: number): number => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const startDrag = useCallback((type: 'head' | 'in' | 'out') => (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(type);

    const onMove = (ev: MouseEvent) => {
      const pct = getPct(ev.clientX);
      if (type === 'head') {
        onSeek(pct * duration);
      } else if (type === 'in') {
        const clamped = Math.max(0, Math.min(pct, outPoint - 0.02));
        setInPoint(clamped);
        if (onTrimChange) onTrimChange(clamped * duration, outPoint * duration);
      } else {
        const clamped = Math.min(1, Math.max(pct, inPoint + 0.02));
        setOutPoint(clamped);
        if (onTrimChange) onTrimChange(inPoint * duration, clamped * duration);
      }
    };
    const onUp = () => {
      setIsDragging(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [duration, inPoint, outPoint, onSeek, onTrimChange]);

  const handleTrackClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    const pct = getPct(e.clientX);
    onSeek(pct * duration);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pct = getPct(e.clientX);
    setHoverTime(pct * duration);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
  };

  const formatTime = (t: number) => {
    const s = Math.max(0, t);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s % 1) * 10))}`;
  };

  const tickCount = Math.min(10, Math.max(4, Math.floor(duration / 5)));
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i / tickCount);

  return (
    <div className="bg-[#0a0f1a] border border-[#1f2937] rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#1f2937] bg-[#0d1425]/70">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Scissors className="text-primary" size={14} />
            <span className="text-[10px] font-black text-[#e0e5f6] uppercase tracking-widest">Precision Timeline</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/5">
            <Volume2 className="text-primary" size={11} />
            <span className="text-[9px] text-white/70 font-mono">Dynamic Waveform</span>
          </div>
          {cutIntervals.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] font-bold">
              <span>✂️ {cutIntervals.length} jump-cut{cutIntervals.length > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Trim range display */}
          <span className="text-[10px] font-mono text-primary tracking-wider bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
            {formatTime(inPoint * duration)} — {formatTime(outPoint * duration)}
          </span>
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-[#1f2937] rounded-lg px-2 py-0.5">
            <button
              onClick={() => setZoom(z => Math.max(1, +(z - 0.5).toFixed(1)))}
              className="text-[#6b7280] hover:text-white transition-colors"
              disabled={zoom <= 1}
            >
              <ZoomOut size={12} />
            </button>
            <span className="text-[9px] font-black text-[#e0e5f6] w-6 text-center">{zoom}×</span>
            <button
              onClick={() => setZoom(z => Math.min(4, +(z + 0.5).toFixed(1)))}
              className="text-[#6b7280] hover:text-white transition-colors"
              disabled={zoom >= 4}
            >
              <ZoomIn size={12} />
            </button>
          </div>
          <span className="text-[10px] font-black text-[#4b5563] uppercase tracking-widest font-mono">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Time ruler */}
      <div className="relative h-5 bg-[#030712] px-0 border-b border-[#1f2937] overflow-hidden">
        {ticks.map((t, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 flex flex-col items-center justify-end pb-0.5"
            style={{ left: `${t * 100}%` }}
          >
            <div className="w-px bg-[#2d3748]" style={{ height: i % 2 === 0 ? '10px' : '5px' }} />
            {i % 2 === 0 && (
              <span className="absolute top-0.5 text-[8px] text-[#6b7280] font-mono -translate-x-1/2">
                {formatTime(t * duration)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Main track */}
      <div className="relative select-none" style={{ overflowX: 'hidden' }}>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Video timeline seeking"
          aria-valuenow={currentTime}
          aria-valuemin={0}
          aria-valuemax={duration}
          className="relative h-20 bg-[#030712] cursor-crosshair focus:outline-none focus:ring-1 focus:ring-primary group"
          onClick={handleTrackClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') { onSeek(Math.min(duration, currentTime + 2)); e.preventDefault(); }
            if (e.key === 'ArrowLeft') { onSeek(Math.max(0, currentTime - 2)); e.preventDefault(); }
          }}
        >
          {/* Waveform bars */}
          <div className="absolute inset-0 flex items-center px-2 gap-[2px] pointer-events-none">
            {waveformBars.map((bar, i) => {
              const pct = i / waveformBars.length;
              const inRegion = pct >= inPoint && pct <= outPoint;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-all duration-150"
                  style={{
                    height: `${bar.height}%`,
                    backgroundColor: bar.isExcluded
                      ? 'rgba(239, 68, 68, 0.4)'
                      : inRegion
                      ? bar.isSpeech
                        ? `rgba(200, 119, 64, ${0.5 + bar.height / 150})`
                        : 'rgba(255, 255, 255, 0.15)'
                      : 'rgba(255, 255, 255, 0.05)',
                  }}
                />
              );
            })}
          </div>

          {/* Visual cut region markers (for jump cuts) */}
          {duration > 0 && cutIntervals.map((cut, idx) => {
            const leftPct = Math.max(0, (cut.start / duration) * 100);
            const widthPct = Math.min(100 - leftPct, ((cut.end - cut.start) / duration) * 100);
            return (
              <div
                key={idx}
                className="absolute top-0 bottom-0 z-15 pointer-events-none bg-red-500/20 border-x border-red-500/50 flex items-center justify-center overflow-hidden"
                style={{
                  left: `${leftPct}%`,
                  width: `${Math.max(0.8, widthPct)}%`,
                  backgroundImage: 'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.15) 4px, transparent 4px, transparent 8px)'
                }}
                title={`Cut: "${cut.word}"`}
              >
                <Scissors size={10} className="text-red-400 rotate-90 opacity-60" />
              </div>
            );
          })}

          {/* Trim region overlay */}
          <div
            className="absolute top-0 bottom-0 z-10 pointer-events-none"
            style={{
              left: `${inPoint * 100}%`,
              width: `${(outPoint - inPoint) * 100}%`,
              backgroundColor: 'rgba(200,119,64,0.06)',
              borderTop: '2px solid rgba(200,119,64,0.6)',
              borderBottom: '2px solid rgba(200,119,64,0.6)',
            }}
          />

          {/* IN point handle */}
          <div
            className="absolute top-0 bottom-0 w-4 flex items-center justify-center cursor-ew-resize z-25 group/in"
            style={{ left: `calc(${inPoint * 100}% - 8px)` }}
            onMouseDown={startDrag('in')}
          >
            <div className="w-1.5 h-12 bg-primary rounded-full group-hover/in:w-2 transition-all shadow-lg ring-2 ring-black/40" />
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded bg-primary text-[8px] font-black text-white whitespace-nowrap opacity-0 group-hover/in:opacity-100 transition-opacity">IN</div>
          </div>

          {/* OUT point handle */}
          <div
            className="absolute top-0 bottom-0 w-4 flex items-center justify-center cursor-ew-resize z-25 group/out"
            style={{ left: `calc(${outPoint * 100}% - 8px)` }}
            onMouseDown={startDrag('out')}
          >
            <div className="w-1.5 h-12 bg-primary rounded-full group-hover/out:w-2 transition-all shadow-lg ring-2 ring-black/40" />
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded bg-primary text-[8px] font-black text-white whitespace-nowrap opacity-0 group-hover/out:opacity-100 transition-opacity">OUT</div>
          </div>

          {/* Hover scrubber */}
          {hoverTime !== null && !isDragging && (
            <div
              className="absolute top-0 bottom-0 w-px bg-white/40 z-20 pointer-events-none"
              style={{ left: `${(hoverTime / duration) * 100}%` }}
            >
              <div className="absolute -bottom-5 -translate-x-1/2 px-1.5 py-0.5 bg-[#1f2937] text-white/90 rounded text-[8px] font-mono whitespace-nowrap shadow-lg">
                {formatTime(hoverTime)}
              </div>
            </div>
          )}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-white z-30 pointer-events-none"
            style={{ left: `${progress * 100}%` }}
          >
            {/* Diamond top */}
            <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white rotate-45 shadow-[0_0_10px_rgba(255,255,255,1)]" />
            {/* Current time bubble */}
            <div className="absolute top-4 -translate-x-1/2 px-1.5 py-0.5 bg-white rounded text-[8px] font-black text-black whitespace-nowrap shadow-xl">
              {formatTime(currentTime)}
            </div>
          </div>
        </div>

        {/* Audio track row */}
        <div className="h-7 bg-[#020409] border-t border-[#1f2937] flex items-center px-3 gap-2">
          <Music size={10} className="text-[#374151]" />
          <div className="flex-1 flex items-center gap-[2px] h-3">
            {waveformBars.slice(0, 60).map((b, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: `${b.height * 0.4}%`,
                  backgroundColor: b.isExcluded ? 'rgba(239,68,68,0.5)' : 'rgba(99,102,241,0.3)',
                }}
              />
            ))}
          </div>
          <span className="text-[8px] text-[#4b5563] font-bold uppercase tracking-widest">Speech Track</span>
        </div>
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between px-5 py-2 border-t border-[#1f2937] bg-[#020409]">
        <span className="text-[9px] font-bold text-[#4b5563] uppercase tracking-widest font-mono">
          Trimmed: {formatTime((outPoint - inPoint) * duration)} / {formatTime(duration)}
        </span>
        <div className="flex items-center gap-4">
          <span className="text-[9px] text-[#4b5563]">Drag waveform to seek · Red sections indicate cut filler words</span>
        </div>
      </div>
    </div>
  );
};
