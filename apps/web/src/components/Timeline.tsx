import React, { useRef, useState, useCallback } from 'react';
import { Scissors, Music, ZoomIn, ZoomOut } from 'lucide-react';

interface TimelineProps {
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  /** Optional callbacks fired when the user drags the trim handles */
  onTrimChange?: (inPoint: number, outPoint: number) => void;
}

const STATIC_WAVEFORM = [
  50, 72, 44, 80, 60, 28, 86, 38, 94, 68,
  52, 34, 88, 64, 40, 78, 48, 74, 58, 30,
  84, 44, 92, 68, 52, 34, 88, 62, 48, 80,
  56, 28, 84, 40, 90, 70, 52, 36, 88, 64,
  46, 76, 58, 30, 84, 52, 92, 66, 38, 82,
  54, 28, 86, 44, 94, 70, 56, 34, 90, 62,
  48, 80, 58, 30, 84, 42, 94, 68, 54, 36,
  90, 64, 48, 80, 58, 28, 86, 40, 94, 68,
];

export const Timeline: React.FC<TimelineProps> = ({
  duration,
  currentTime,
  onSeek,
  onTrimChange,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [inPoint, setInPoint] = useState(0);          // 0–1 normalised
  const [outPoint, setOutPoint] = useState(1);         // 0–1 normalised
  const [zoom, setZoom] = useState(1);                  // 1–4x
  const [isDragging, setIsDragging] = useState<'head' | 'in' | 'out' | null>(null);

  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;

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

  const formatTime = (t: number) => {
    const s = Math.max(0, t);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  // Time ruler tick count
  const tickCount = Math.min(10, Math.max(4, Math.floor(duration / 5)));
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i / tickCount);

  return (
    <div className="bg-[#0d1117] border border-[#1f2937] rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#1f2937]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Scissors className="text-primary" size={14} />
            <span className="text-[10px] font-black text-[#e0e5f6] uppercase tracking-widest">Timeline</span>
          </div>
          <div className="flex items-center gap-1.5 opacity-40">
            <Music className="text-[#e0e5f6]" size={12} />
            <span className="text-[10px] text-[#e0e5f6] uppercase tracking-widest font-medium">Audio</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Trim range display */}
          <span className="text-[10px] font-mono text-primary/70 tracking-wider">
            {formatTime(inPoint * duration)} — {formatTime(outPoint * duration)}
          </span>
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-[#1f2937] rounded-lg px-2 py-1">
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
          <span className="text-[10px] font-black text-[#4b5563] uppercase tracking-widest">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Time ruler */}
      <div className="relative h-5 bg-[#030712] px-0 border-b border-[#1f2937] overflow-hidden">
        {ticks.map((t, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 flex flex-col items-center justify-end pb-1"
            style={{ left: `${t * 100}%` }}
          >
            <div className="w-px bg-[#2d3748]" style={{ height: i % 2 === 0 ? '10px' : '5px' }} />
            {i % 2 === 0 && (
              <span className="absolute top-1 text-[8px] text-[#4b5563] font-mono -translate-x-1/2">
                {formatTime(t * duration)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Main track */}
      <div className="relative select-none" style={{ overflowX: 'hidden' }}>
        {/* Waveform track */}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Video timeline seeking"
          aria-valuenow={currentTime}
          aria-valuemin={0}
          aria-valuemax={duration}
          className="relative h-20 bg-[#030712] cursor-crosshair focus:outline-none focus:ring-1 focus:ring-primary"
          onClick={handleTrackClick}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') { onSeek(Math.min(duration, currentTime + 2)); e.preventDefault(); }
            if (e.key === 'ArrowLeft') { onSeek(Math.max(0, currentTime - 2)); e.preventDefault(); }
          }}
        >
          {/* Waveform bars */}
          <div className="absolute inset-0 flex items-center px-2 gap-px pointer-events-none">
            {STATIC_WAVEFORM.map((h, i) => {
              const pct = i / STATIC_WAVEFORM.length;
              const inRegion = pct >= inPoint && pct <= outPoint;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${h}%`,
                    backgroundColor: inRegion
                      ? `rgba(200,119,64,${0.4 + h / 200})`
                      : 'rgba(255,255,255,0.08)',
                    transition: 'background-color 0.2s',
                  }}
                />
              );
            })}
          </div>

          {/* Trim region overlay */}
          <div
            className="absolute top-0 bottom-0 z-10 pointer-events-none"
            style={{
              left: `${inPoint * 100}%`,
              width: `${(outPoint - inPoint) * 100}%`,
              backgroundColor: 'rgba(200,119,64,0.06)',
              borderTop: '2px solid rgba(200,119,64,0.5)',
              borderBottom: '2px solid rgba(200,119,64,0.5)',
            }}
          />

          {/* IN point handle */}
          <div
            className="absolute top-0 bottom-0 w-3 flex items-center justify-center cursor-ew-resize z-20 group/in"
            style={{ left: `calc(${inPoint * 100}% - 6px)` }}
            onMouseDown={startDrag('in')}
          >
            <div className="w-1.5 h-10 bg-primary rounded-full group-hover/in:w-2 transition-all shadow-md" />
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[7px] font-black text-primary whitespace-nowrap opacity-0 group-hover/in:opacity-100 transition-opacity">IN</div>
          </div>

          {/* OUT point handle */}
          <div
            className="absolute top-0 bottom-0 w-3 flex items-center justify-center cursor-ew-resize z-20 group/out"
            style={{ left: `calc(${outPoint * 100}% - 6px)` }}
            onMouseDown={startDrag('out')}
          >
            <div className="w-1.5 h-10 bg-primary rounded-full group-hover/out:w-2 transition-all shadow-md" />
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[7px] font-black text-primary whitespace-nowrap opacity-0 group-hover/out:opacity-100 transition-opacity">OUT</div>
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-white z-30 pointer-events-none"
            style={{ left: `${progress * 100}%` }}
          >
            {/* Diamond top */}
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-white rotate-45 shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
            {/* Current time bubble */}
            <div className="absolute top-5 -translate-x-1/2 px-1.5 py-0.5 bg-white rounded text-[8px] font-black text-black whitespace-nowrap shadow-lg">
              {formatTime(currentTime)}
            </div>
          </div>
        </div>

        {/* Audio track row */}
        <div className="h-7 bg-[#020409] border-t border-[#1f2937] flex items-center px-3 gap-2">
          <Music size={10} className="text-[#374151]" />
          <div className="flex-1 flex items-center gap-px h-3">
            {Array.from({ length: 60 }, (_, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: `${25 + Math.sin(i * 0.7) * 20 + Math.cos(i * 0.3) * 15}%`,
                  backgroundColor: 'rgba(99,102,241,0.25)',
                }}
              />
            ))}
          </div>
          <span className="text-[8px] text-[#374151] font-bold uppercase tracking-widest">Original Audio</span>
        </div>
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between px-5 py-2 border-t border-[#1f2937] bg-[#020409]">
        <span className="text-[9px] font-bold text-[#374151] uppercase tracking-widest">
          Clip: {formatTime((outPoint - inPoint) * duration)}
        </span>
        <div className="flex items-center gap-4">
          <span className="text-[9px] text-[#374151]">Drag waveform to seek · Handles to trim</span>
        </div>
      </div>
    </div>
  );
};
