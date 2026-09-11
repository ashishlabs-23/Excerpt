'use client';

import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SidebarNav } from '@/components/SidebarNav';
import { EditorSidebar, ExportOptions } from '@/components/EditorSidebar';
import { VideoPlayer } from '@/components/VideoPlayer';
import { Timeline } from '@/components/Timeline';
import { TranscriptView } from '@/components/TranscriptView';
import { authFetch, exportCustomClip, getClipPlayUrl } from '@/lib/api';
import { AuthGate } from '@/components/AuthGate';
import {
  Scissors, ArrowLeft, AlertCircle, Loader2, ChevronDown, Film,
  Check, Type, Sparkles, Undo2, Redo2, RotateCcw, X, Zap, Download
} from 'lucide-react';
import Link from 'next/link';

interface ClipData {
  id: string | null;
  url: string;
  title: string;
  startTime: number;
  endTime: number;
  words: Array<{ word: string; start: number; end: number }>;
  viralityScore?: number;
  intent?: string;
}

interface HistorySnapshot {
  words: Array<{ word: string; start: number; end: number }>;
  excludedWordIndices: number[];
  trimIn: number;
  trimOut: number;
}

export default function ClipEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-[#030712] text-white">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      }
    >
      <AuthGate>
        <ClipEditorContent />
      </AuthGate>
    </Suspense>
  );
}

function ClipEditorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [videoData, setVideoData] = useState<ClipData | null>(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Playback & tool state
  const [currentTime, setCurrentTime] = useState(0);
  const [manualSeek, setManualSeek] = useState<number | null>(null);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [faceCenteringEnabled, setFaceCenteringEnabled] = useState(true);
  const [bRollEnabled, setBRollEnabled] = useState(false);
  const [excludedWordIndices, setExcludedWordIndices] = useState<Set<number>>(new Set());
  const [captionStyle, setCaptionStyle] = useState('Submagic');
  const [captionFontSize, setCaptionFontSize] = useState(28);
  const [captionPosition, setCaptionPosition] = useState<'bottom' | 'middle' | 'top'>('bottom');
  const [captionColor, setCaptionColor] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [cropOffset, setCropOffset] = useState<number>(0);
  const [thumbnailTime, setThumbnailTime] = useState<number | null>(null);
  const [thumbnailTitle, setThumbnailTitle] = useState<string>('');
  const [socialPreviewMode, setSocialPreviewMode] = useState<'tiktok' | 'youtube' | 'instagram' | 'none'>('none');
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  const [availableClips, setAvailableClips] = useState<any[]>([]);
  const [isClipDropdownOpen, setIsClipDropdownOpen] = useState(false);

  // Responsive Drawer states for mobile/tablet
  const [isTranscriptDrawerOpen, setIsTranscriptDrawerOpen] = useState(false);
  const [isStudioDrawerOpen, setIsStudioDrawerOpen] = useState(false);

  // Trim points (absolute seconds, matching the clip's startTime/endTime)
  const [trimIn, setTrimIn] = useState(0);
  const [trimOut, setTrimOut] = useState(0);

  // Undo / Redo history state
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const pristineSnapshotRef = useRef<HistorySnapshot | null>(null);
  const isHistoryActionRef = useRef(false);

  // Push snapshot to history stack
  const pushSnapshot = useCallback((
    words: Array<{ word: string; start: number; end: number }>,
    excluded: Set<number>,
    tIn: number,
    tOut: number
  ) => {
    if (isHistoryActionRef.current) {
      isHistoryActionRef.current = false;
      return;
    }
    const newSnapshot: HistorySnapshot = {
      words,
      excludedWordIndices: Array.from(excluded),
      trimIn: tIn,
      trimOut: tOut,
    };
    setHistory(prev => {
      const sliced = prev.slice(0, historyIndex + 1);
      const next = [...sliced, newSnapshot];
      return next.slice(-30); // limit to 30 snapshots
    });
    setHistoryIndex(prev => Math.min(29, prev + 1));
  }, [historyIndex]);

  // Load clip data from URL params + API + localStorage restore
  useEffect(() => {
    let cancelled = false;
    const id = searchParams.get('id');
    const title = searchParams.get('title') || 'Untitled Clip';
    const start = parseFloat(searchParams.get('start') || '0');
    const end = parseFloat(searchParams.get('end') || '60');

    setIsLoadingMeta(true);
    setMetaError(null);

    (async () => {
      try {
        const clipsResponse = await authFetch('/api/video/clips');
        if (cancelled) return;

        if (!clipsResponse.ok) {
          throw new Error(`API error ${clipsResponse.status}`);
        }

        const clips = await clipsResponse.json();
        if (Array.isArray(clips)) {
          setAvailableClips(clips);
        }

        let targetId = id;
        let clip = Array.isArray(clips) ? clips.find((item: any) => item.id === id) : null;

        // If no clip ID in URL and clips exist, auto-select the latest clip
        if (!targetId && Array.isArray(clips) && clips.length > 0) {
          clip = clips[0];
          targetId = clip.id;
          const autoTitle = clip.title || clip.metadata?.title || 'Clip';
          const autoStart = typeof clip.start_time === 'number' ? clip.start_time : 0;
          const autoEnd = typeof clip.end_time === 'number' ? clip.end_time : 60;
          router.replace(`/editor?id=${targetId}&title=${encodeURIComponent(autoTitle)}&start=${autoStart}&end=${autoEnd}`);
        }

        if (!targetId) {
          setIsLoadingMeta(false);
          return;
        }

        const playUrl = await getClipPlayUrl(targetId);
        if (cancelled) return;

        const rawWords: any[] = clip?.metadata?.words || clip?.words || [];
        const clipStart = typeof clip?.start_time === 'number' ? clip.start_time : start;
        const clipEnd = typeof clip?.end_time === 'number' ? clip.end_time : end;
        const totalClipDuration = Math.max(1, clipEnd - clipStart);

        // If rawWords have timestamps offset by source video time, normalize relative to 0
        const isOffset = rawWords.length > 0 && clipStart > 2.0 && rawWords.some((w: any) => typeof w.start === 'number' && w.start >= (clipStart * 0.5));
        const normalizedWords = rawWords.map((w: any) => ({
          ...w,
          start: isOffset ? Math.max(0, Number((w.start - clipStart).toFixed(3))) : Number(w.start.toFixed(3)),
          end: isOffset ? Math.max(0.05, Number((w.end - clipStart).toFixed(3))) : Number(w.end.toFixed(3)),
        }));

        // In studio editor, request clean video stream so interactive captions overlay cleanly
        const cleanPlayUrl = playUrl.includes('?') ? `${playUrl}&captions=0` : `${playUrl}?captions=0`;

        const pristineSnapshot: HistorySnapshot = {
          words: normalizedWords,
          excludedWordIndices: [],
          trimIn: 0,
          trimOut: totalClipDuration,
        };
        pristineSnapshotRef.current = pristineSnapshot;

        // Check local storage for existing session edits
        let initialWords = normalizedWords;
        let initialExcluded = new Set<number>();
        let initialTrimIn = 0;
        let initialTrimOut = totalClipDuration;

        try {
          const savedStr = localStorage.getItem(`excerpt_editor_${targetId}`);
          if (savedStr) {
            const saved = JSON.parse(savedStr);
            if (Array.isArray(saved.words) && saved.words.length === normalizedWords.length) {
              initialWords = saved.words;
            }
            if (Array.isArray(saved.excludedWordIndices)) {
              initialExcluded = new Set(saved.excludedWordIndices);
            }
            if (typeof saved.trimIn === 'number') initialTrimIn = saved.trimIn;
            if (typeof saved.trimOut === 'number') initialTrimOut = saved.trimOut;
            if (saved.captionStyle) setCaptionStyle(saved.captionStyle);
            if (typeof saved.captionFontSize === 'number') setCaptionFontSize(saved.captionFontSize);
            if (saved.captionPosition) setCaptionPosition(saved.captionPosition);
            if (typeof saved.captionColor === 'string') setCaptionColor(saved.captionColor);
            if (typeof saved.cropOffset === 'number') setCropOffset(saved.cropOffset);
          }
        } catch (storageErr) {
          console.warn('[Editor]: Could not restore localStorage draft', storageErr);
        }

        setVideoData({
          id: targetId,
          url: cleanPlayUrl,
          title: clip?.title || clip?.metadata?.title || title,
          startTime: 0,
          endTime: totalClipDuration,
          words: initialWords,
          viralityScore: clip?.metadata?.virality_score,
          intent: clip?.metadata?.generation_intent || clip?.metadata?.intent,
        });
        setExcludedWordIndices(initialExcluded);
        setTrimIn(initialTrimIn);
        setTrimOut(initialTrimOut);

        // Initialize history
        const initialSnap: HistorySnapshot = {
          words: initialWords,
          excludedWordIndices: Array.from(initialExcluded),
          trimIn: initialTrimIn,
          trimOut: initialTrimOut,
        };
        setHistory([initialSnap]);
        setHistoryIndex(0);
      } catch (err) {
        console.error('Failed to fetch clip metadata:', err);
        if (!cancelled) {
          setMetaError('Could not load clip. Check your session and try again.');
        }
      } finally {
        if (!cancelled) setIsLoadingMeta(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  // Auto-save edits to localStorage per clipId
  useEffect(() => {
    if (!videoData?.id || isLoadingMeta) return;
    const timeout = setTimeout(() => {
      try {
        const payload = {
          words: videoData.words,
          excludedWordIndices: Array.from(excludedWordIndices),
          trimIn,
          trimOut,
          captionStyle,
          captionFontSize,
          captionPosition,
          captionColor,
          cropOffset,
          updatedAt: Date.now(),
        };
        localStorage.setItem(`excerpt_editor_${videoData.id}`, JSON.stringify(payload));
      } catch (e) {
        console.warn('Failed to auto-save to localStorage:', e);
      }
    }, 600);

    return () => clearTimeout(timeout);
  }, [
    videoData?.id,
    videoData?.words,
    excludedWordIndices,
    trimIn,
    trimOut,
    captionStyle,
    captionFontSize,
    captionPosition,
    captionColor,
    cropOffset,
    isLoadingMeta,
  ]);

  // Undo and Redo handlers
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      const snap = history[prevIndex];
      isHistoryActionRef.current = true;
      setVideoData(prev => prev ? { ...prev, words: snap.words } : null);
      setExcludedWordIndices(new Set(snap.excludedWordIndices));
      setTrimIn(snap.trimIn);
      setTrimOut(snap.trimOut);
      setHistoryIndex(prevIndex);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      const snap = history[nextIndex];
      isHistoryActionRef.current = true;
      setVideoData(prev => prev ? { ...prev, words: snap.words } : null);
      setExcludedWordIndices(new Set(snap.excludedWordIndices));
      setTrimIn(snap.trimIn);
      setTrimOut(snap.trimOut);
      setHistoryIndex(nextIndex);
    }
  }, [history, historyIndex]);

  // Reset to original clip state
  const handleResetOriginal = useCallback(() => {
    if (!pristineSnapshotRef.current || !videoData?.id) return;
    if (!window.confirm('Reset all cuts, trims, and style changes back to the original clip?')) return;
    const snap = pristineSnapshotRef.current;
    isHistoryActionRef.current = true;
    setVideoData(prev => prev ? { ...prev, words: snap.words } : null);
    setExcludedWordIndices(new Set(snap.excludedWordIndices));
    setTrimIn(snap.trimIn);
    setTrimOut(snap.trimOut);
    setCaptionStyle('Submagic');
    setCaptionFontSize(28);
    setCaptionPosition('bottom');
    setCaptionColor('');
    setCropOffset(0);

    try {
      localStorage.removeItem(`excerpt_editor_${videoData.id}`);
    } catch (e) {}

    setHistory([snap]);
    setHistoryIndex(0);
  }, [videoData?.id]);

  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const handleWordEdit = useCallback((index: number, newWord: string) => {
    setVideoData(prev => {
      if (!prev) return null;
      const updatedWords = [...prev.words];
      updatedWords[index] = { ...updatedWords[index], word: newWord };
      pushSnapshot(updatedWords, excludedWordIndices, trimIn, trimOut);
      return { ...prev, words: updatedWords };
    });
  }, [excludedWordIndices, trimIn, trimOut, pushSnapshot]);

  const handleToggleExcludeWord = useCallback((index: number) => {
    setExcludedWordIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      if (videoData?.words) {
        pushSnapshot(videoData.words, next, trimIn, trimOut);
      }
      return next;
    });
  }, [videoData?.words, trimIn, trimOut, pushSnapshot]);

  const handleSetExcludedWords = useCallback((next: Set<number>) => {
    setExcludedWordIndices(next);
    if (videoData?.words) {
      pushSnapshot(videoData.words, next, trimIn, trimOut);
    }
  }, [videoData?.words, trimIn, trimOut, pushSnapshot]);

  const handleTrimChange = useCallback((inSec: number, outSec: number) => {
    const newIn = inSec + (videoData?.startTime || 0);
    const newOut = outSec + (videoData?.startTime || 0);
    setTrimIn(newIn);
    setTrimOut(newOut);
    if (videoData?.words) {
      pushSnapshot(videoData.words, excludedWordIndices, newIn, newOut);
    }
  }, [videoData?.startTime, videoData?.words, excludedWordIndices, pushSnapshot]);

  const handleExport = useCallback(async (opts: ExportOptions) => {
    if (!videoData?.id) return;
    setIsExporting(true);
    setExportSuccess(false);

    try {
      const fileName = videoData.title
        ? `${videoData.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.mp4`
        : `excerpt-clip-${videoData.id}.mp4`;

      const cuts: Array<{ start: number; end: number }> = [];
      if (videoData.words && excludedWordIndices.size > 0) {
        videoData.words.forEach((w: any, idx: number) => {
          if (excludedWordIndices.has(idx)) {
            cuts.push({ start: w.start, end: w.end });
          }
        });
      }

      await exportCustomClip(videoData.id, fileName, {
        trimIn,
        trimOut,
        cuts: cuts.length > 0 ? cuts : undefined,
        cropOffset,
        aspectRatio: opts.aspectRatio,
        quality: opts.quality,
        captionStyle,
        captions: captionsEnabled,
        words: videoData.words,
      });

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
    } catch (err: any) {
      console.error('Export failed:', err);
      window.alert(err?.message || 'Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [videoData, captionsEnabled, trimIn, trimOut, excludedWordIndices, captionStyle, cropOffset]);

  const clipDuration = videoData ? videoData.endTime - videoData.startTime : 0;

  // Calculate readiness score
  const readinessScore = React.useMemo(() => {
    let score = 0;
    if (videoData?.title) score += 15;
    if (captionsEnabled) score += 25;
    if (thumbnailTime !== null) score += 30;
    if (thumbnailTitle.trim().length > 0) score += 30;
    return score;
  }, [videoData, captionsEnabled, thumbnailTime, thumbnailTitle]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className="flex h-screen bg-[#030712] text-[#e0e5f6] overflow-hidden">
      <SidebarNav />

      <main className="flex-grow flex flex-col min-w-0 h-full overflow-hidden">
        {/* ── Top Header ── */}
        <header className="h-16 border-b border-[#1a2235] flex items-center justify-between px-4 sm:px-6 bg-[#030712]/80 backdrop-blur-xl shrink-0 z-10">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Back button */}
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 text-[#4b5563] hover:text-white transition-colors text-sm font-medium"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:block">Dashboard</span>
            </Link>

            <div className="w-px h-5 bg-[#1a2235]" />

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#C87740] to-[#E5A16F] flex items-center justify-center shadow-lg shadow-primary/20">
                <Scissors className="text-white" size={16} />
              </div>
              <div>
                {isEditingTitle ? (
                  <input
                    autoFocus
                    value={videoData?.title || ''}
                    onChange={e => {
                      const newTitle = e.target.value;
                      setVideoData(prev => prev ? { ...prev, title: newTitle } : null);
                    }}
                    onBlur={() => setIsEditingTitle(false)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setIsEditingTitle(false); }}
                    className="text-sm font-bold tracking-tight bg-white/10 text-white rounded px-2 py-0.5 border border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary max-w-[160px] sm:max-w-xs"
                  />
                ) : (
                  <h1
                    onClick={() => setIsEditingTitle(true)}
                    className="text-sm font-bold tracking-tight truncate max-w-[140px] sm:max-w-xs cursor-pointer hover:text-primary transition-colors flex items-center gap-1.5"
                    title="Click to rename clip"
                  >
                    <span>{videoData?.title || 'Clip Editor'}</span>
                    <span className="text-[10px] text-white/30 hover:text-white">✎</span>
                  </h1>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[9px] text-[#4b5563] font-black uppercase tracking-widest">Studio Mode</span>
                </div>
              </div>

              {/* ── Clip Switcher Dropdown ── */}
              <div className="relative ml-1 sm:ml-2">
                <button
                  type="button"
                  onClick={() => setIsClipDropdownOpen(prev => !prev)}
                  className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#111827] hover:bg-[#1a2235] border border-[#1f2937] hover:border-primary/40 transition-all text-xs font-semibold text-[#e0e5f6] shadow-sm"
                  title="Switch between clips"
                >
                  <Film size={13} className="text-primary" />
                  <span className="hidden md:inline text-white/40 text-[10px] uppercase font-black">Clip:</span>
                  <span className="max-w-[80px] sm:max-w-[140px] truncate">
                    {videoData?.title || 'Select Clip'}
                  </span>
                  <ChevronDown size={13} className={`text-white/40 transition-transform duration-200 ${isClipDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isClipDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsClipDropdownOpen(false)} />
                    <div className="absolute top-full left-0 mt-2 w-80 max-h-96 overflow-y-auto bg-[#0d1425] border border-[#1f2937] rounded-2xl shadow-2xl z-50 p-2 space-y-1 custom-scrollbar">
                      <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#4b5563] border-b border-white/5 flex items-center justify-between">
                        <span>Your Clips ({availableClips.length})</span>
                        <span className="text-[9px] text-primary">Switch</span>
                      </div>
                      {availableClips.length === 0 ? (
                        <div className="p-4 text-center text-xs text-white/40">No clips found</div>
                      ) : (
                        availableClips.map((c: any) => {
                          const isSelected = c.id === videoData?.id;
                          const cTitle = c.title || c.metadata?.title || 'Untitled Clip';
                          const cDur = typeof c.start_time === 'number' && typeof c.end_time === 'number'
                            ? Math.round(c.end_time - c.start_time)
                            : 0;
                          const score = c.metadata?.virality_score || c.virality_score;

                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setIsClipDropdownOpen(false);
                                router.replace(`/editor?id=${c.id}&title=${encodeURIComponent(cTitle)}&start=${c.start_time || 0}&end=${c.end_time || 60}`);
                              }}
                              className={`w-full text-left p-2.5 rounded-xl transition-all flex items-center justify-between gap-3 ${
                                isSelected
                                  ? 'bg-primary/20 border border-primary/40 text-white'
                                  : 'hover:bg-white/5 border border-transparent text-white/80 hover:text-white'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold truncate">{cTitle}</p>
                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/40">
                                  {cDur > 0 && <span>{cDur}s</span>}
                                  {score && <span className="text-primary font-bold">{score}% viral</span>}
                                </div>
                              </div>
                              {isSelected && <Check size={14} className="text-primary shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Undo / Redo Toolbar Buttons */}
            <div className="flex items-center bg-[#111827] rounded-xl border border-[#1f2937] p-0.5">
              <button
                type="button"
                onClick={handleUndo}
                disabled={!canUndo}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 size={14} />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={!canRedo}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 size={14} />
              </button>
            </div>

            {/* Reset to Original Button */}
            {(excludedWordIndices.size > 0 || trimIn > 0 || (videoData && trimOut < videoData.endTime - 0.1)) && (
              <button
                type="button"
                onClick={handleResetOriginal}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-all"
                title="Reset all edits to original clip"
              >
                <RotateCcw size={12} />
                <span className="text-[10px]">Reset</span>
              </button>
            )}

            {/* Quick Caption Toggle in Header */}
            <button
              type="button"
              onClick={() => setCaptionsEnabled(prev => !prev)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-sm ${
                captionsEnabled
                  ? 'bg-primary/15 border-primary/40 text-primary hover:bg-primary/25'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
              }`}
              title={captionsEnabled ? 'Click to remove captions' : 'Click to add captions'}
            >
              <Type size={13} />
              <span className="hidden sm:inline">{captionsEnabled ? 'Captions ON' : 'Captions OFF'}</span>
            </button>

            {/* Responsive Drawers Triggers (Mobile / Tablet) */}
            <button
              type="button"
              onClick={() => setIsTranscriptDrawerOpen(true)}
              className="xl:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#111827] border border-[#1f2937] hover:border-primary/40 text-xs font-bold text-white transition-all shadow-sm"
              title="Open Transcript"
            >
              <Zap size={13} className="text-primary" />
              <span className="hidden md:inline">Transcript</span>
              {excludedWordIndices.size > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-400 text-[9px] font-mono font-black">
                  -{excludedWordIndices.size}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsStudioDrawerOpen(true)}
              className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#111827] border border-[#1f2937] hover:border-primary/40 text-xs font-bold text-white transition-all shadow-sm"
              title="Open Studio Panel"
            >
              <Sparkles size={13} className="text-primary" />
              <span className="hidden md:inline">Studio</span>
            </button>

            {/* Clip info pills */}
            {videoData && (
              <>
                <div className="hidden xl:flex px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1f2937] items-center gap-2">
                  <span className="text-[9px] font-black text-[#4b5563] uppercase tracking-widest">Duration</span>
                  <span className="text-[10px] font-bold text-[#e0e5f6]">
                    {Math.floor(clipDuration / 60)}m {Math.floor(clipDuration % 60)}s
                  </span>
                </div>
                {isLoadingMeta && (
                  <div className="flex items-center gap-2 text-[#4b5563]">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:block">Loading</span>
                  </div>
                )}
                {exportSuccess && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30">
                    <span className="text-[9px] font-black text-green-400 uppercase tracking-widest">✓ Exported</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleExport({ aspectRatio, quality: 'high', format: 'mp4' })}
                  disabled={isExporting || !videoData}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs shadow-md shadow-primary/25 transition-all active:scale-95 disabled:opacity-50"
                  title="Export this clip as MP4"
                >
                  {isExporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                  <span>{isExporting ? 'Exporting...' : 'Export'}</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* ── Main Workspace ── */}
        <div className="flex-grow flex overflow-hidden">
          {/* Center: Video + Timeline */}
          <div className="flex-grow flex flex-col min-w-0 overflow-hidden">
            {/* Video area */}
            <div className="flex-grow flex items-center justify-center p-3 sm:p-4 lg:p-6 min-h-0 relative bg-[#02060f]">
              {videoData ? (
                <VideoPlayer
                  src={videoData.url}
                  title={videoData.title}
                  startTime={videoData.startTime}
                  endTime={videoData.endTime}
                  onTimeUpdate={setCurrentTime}
                  manualSeekTime={manualSeek}
                  showCaptions={captionsEnabled}
                  faceCentering={faceCenteringEnabled}
                  words={videoData.words}
                  excludedWordIndices={excludedWordIndices}
                  captionStyle={captionStyle}
                  captionFontSize={captionFontSize}
                  captionPosition={captionPosition}
                  captionColor={captionColor}
                  cropOffset={cropOffset}
                  socialPreviewMode={socialPreviewMode}
                  aspectRatio={aspectRatio}
                />
              ) : (
                <div className="text-center opacity-30 space-y-3">
                  <Scissors size={36} className="text-primary mx-auto" />
                  <p className="text-lg font-bold">No Clip Selected</p>
                  <p className="text-sm">Open a clip from the dashboard to edit it here.</p>
                  <Link href="/dashboard" className="inline-block mt-2 text-xs text-primary hover:underline font-bold">
                    ← Go to Dashboard
                  </Link>
                </div>
              )}

              {/* Transcript meta error banner */}
              {metaError && (
                <div className="absolute top-3 left-3 right-3 flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-400 font-medium">
                  <AlertCircle size={14} />
                  {metaError}
                </div>
              )}
            </div>

            {/* Timeline */}
            <div className="shrink-0 p-3 sm:p-4 lg:px-6 lg:pb-5 border-t border-[#1a2235] bg-[#030712]">
              <Timeline
                duration={clipDuration}
                currentTime={currentTime - (videoData?.startTime || 0)}
                words={videoData?.words || []}
                excludedWordIndices={excludedWordIndices}
                onSeek={t => {
                  const abs = (videoData?.startTime || 0) + t;
                  setManualSeek(abs);
                  setTimeout(() => setManualSeek(null), 50);
                }}
                onTrimChange={handleTrimChange}
              />
            </div>
          </div>

          {/* Desktop Transcript panel (xl+) */}
          <div className="hidden xl:flex w-72 2xl:w-80 h-full shrink-0 overflow-hidden border-l border-[#1a2235]">
            <TranscriptView
              words={videoData?.words || []}
              currentTime={currentTime}
              onSeek={t => {
                setManualSeek(t);
                setTimeout(() => setManualSeek(null), 50);
              }}
              onWordEdit={handleWordEdit}
              excludedWordIndices={excludedWordIndices}
              onToggleExcludeWord={handleToggleExcludeWord}
              onSetExcludedWords={handleSetExcludedWords}
            />
          </div>

          {/* Desktop Studio sidebar (lg+) */}
          <div className="hidden lg:flex w-72 2xl:w-80 h-full shrink-0 overflow-hidden">
            <EditorSidebar
              captionsEnabled={captionsEnabled}
              onToggleCaptions={setCaptionsEnabled}
              faceCenteringEnabled={faceCenteringEnabled}
              onToggleFaceCentering={setFaceCenteringEnabled}
              bRollEnabled={bRollEnabled}
              onToggleBRoll={setBRollEnabled}
              onExport={handleExport}
              isExporting={isExporting}
              clipMeta={{
                title: videoData?.title,
                duration: clipDuration,
                viralityScore: videoData?.viralityScore,
                intent: videoData?.intent,
              }}
              captionStyle={captionStyle}
              onChangeCaptionStyle={setCaptionStyle}
              captionFontSize={captionFontSize}
              onChangeCaptionFontSize={setCaptionFontSize}
              captionPosition={captionPosition}
              onChangeCaptionPosition={setCaptionPosition}
              captionColor={captionColor}
              onChangeCaptionColor={setCaptionColor}
              cropOffset={cropOffset}
              onChangeCropOffset={setCropOffset}
              thumbnailTime={thumbnailTime}
              onSelectThumbnailTime={() => setThumbnailTime(currentTime)}
              thumbnailTitle={thumbnailTitle}
              onChangeThumbnailTitle={setThumbnailTitle}
              readinessScore={readinessScore}
              socialPreviewMode={socialPreviewMode === 'none' ? 'tiktok' : socialPreviewMode}
              onChangeSocialPreviewMode={(mode) => setSocialPreviewMode(prev => prev === mode ? 'none' : mode)}
              aspectRatio={aspectRatio}
              onChangeAspectRatio={setAspectRatio}
            />
          </div>
        </div>

        {/* ── Responsive Slide-over Drawer for Transcript (< xl) ── */}
        {isTranscriptDrawerOpen && (
          <div className="xl:hidden fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div
              className="fixed inset-0"
              onClick={() => setIsTranscriptDrawerOpen(false)}
            />
            <div className="relative w-full sm:w-96 h-full bg-[#0a0f1a] shadow-2xl z-10 flex flex-col animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0d1425]">
                <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                  <Zap size={14} className="text-primary" /> Transcript Editor
                </span>
                <button
                  type="button"
                  onClick={() => setIsTranscriptDrawerOpen(false)}
                  className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-grow overflow-hidden">
                <TranscriptView
                  words={videoData?.words || []}
                  currentTime={currentTime}
                  onSeek={t => {
                    setManualSeek(t);
                    setTimeout(() => setManualSeek(null), 50);
                  }}
                  onWordEdit={handleWordEdit}
                  excludedWordIndices={excludedWordIndices}
                  onToggleExcludeWord={handleToggleExcludeWord}
                  onSetExcludedWords={handleSetExcludedWords}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Responsive Slide-over Drawer for Studio (< lg) ── */}
        {isStudioDrawerOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div
              className="fixed inset-0"
              onClick={() => setIsStudioDrawerOpen(false)}
            />
            <div className="relative w-full sm:w-96 h-full bg-[#0a0f1a] shadow-2xl z-10 flex flex-col animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0d1425]">
                <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                  <Sparkles size={14} className="text-primary" /> Clip Studio
                </span>
                <button
                  type="button"
                  onClick={() => setIsStudioDrawerOpen(false)}
                  className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-grow overflow-hidden">
                <EditorSidebar
                  captionsEnabled={captionsEnabled}
                  onToggleCaptions={setCaptionsEnabled}
                  faceCenteringEnabled={faceCenteringEnabled}
                  onToggleFaceCentering={setFaceCenteringEnabled}
                  bRollEnabled={bRollEnabled}
                  onToggleBRoll={setBRollEnabled}
                  onExport={handleExport}
                  isExporting={isExporting}
                  clipMeta={{
                    title: videoData?.title,
                    duration: clipDuration,
                    viralityScore: videoData?.viralityScore,
                    intent: videoData?.intent,
                  }}
                  captionStyle={captionStyle}
                  onChangeCaptionStyle={setCaptionStyle}
                  captionFontSize={captionFontSize}
                  onChangeCaptionFontSize={setCaptionFontSize}
                  captionPosition={captionPosition}
                  onChangeCaptionPosition={setCaptionPosition}
                  captionColor={captionColor}
                  onChangeCaptionColor={setCaptionColor}
                  cropOffset={cropOffset}
                  onChangeCropOffset={setCropOffset}
                  thumbnailTime={thumbnailTime}
                  onSelectThumbnailTime={() => setThumbnailTime(currentTime)}
                  thumbnailTitle={thumbnailTitle}
                  onChangeThumbnailTitle={setThumbnailTitle}
                  readinessScore={readinessScore}
                  socialPreviewMode={socialPreviewMode === 'none' ? 'tiktok' : socialPreviewMode}
                  onChangeSocialPreviewMode={(mode) => setSocialPreviewMode(prev => prev === mode ? 'none' : mode)}
                  aspectRatio={aspectRatio}
                  onChangeAspectRatio={setAspectRatio}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
