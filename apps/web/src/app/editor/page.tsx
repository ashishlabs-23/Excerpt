'use client';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SidebarNav } from '@/components/SidebarNav';
import { EditorSidebar, ExportOptions } from '@/components/EditorSidebar';
import { VideoPlayer } from '@/components/VideoPlayer';
import { Timeline } from '@/components/Timeline';
import { TranscriptView } from '@/components/TranscriptView';
import { authFetch, downloadAuthenticatedClip, getClipPlayUrl } from '@/lib/api';
import { AuthGate } from '@/components/AuthGate';
import { Scissors, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface ClipData {
  id: string | null;
  url: string;
  title: string;
  startTime: number;
  endTime: number;
  words: any[];
  viralityScore?: number;
  intent?: string;
}

function EditorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [videoData, setVideoData] = useState<ClipData | null>(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  // Player state
  const [currentTime, setCurrentTime] = useState(0);
  const [manualSeek, setManualSeek] = useState<number | null>(null);

  // Editor feature toggles
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [faceCenteringEnabled, setFaceCenteringEnabled] = useState(true);
  const [bRollEnabled, setBRollEnabled] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Studio Redesign states
  const [excludedWordIndices, setExcludedWordIndices] = useState<Set<number>>(new Set());
  const [captionStyle, setCaptionStyle] = useState<string>('Submagic');
  const [cropOffset, setCropOffset] = useState<number>(0);
  const [thumbnailTime, setThumbnailTime] = useState<number | null>(null);
  const [thumbnailTitle, setThumbnailTitle] = useState<string>('');
  const [socialPreviewMode, setSocialPreviewMode] = useState<'tiktok' | 'youtube' | 'instagram' | 'none'>('none');

  // Trim points (absolute seconds, matching the clip's startTime/endTime)
  const [trimIn, setTrimIn] = useState(0);
  const [trimOut, setTrimOut] = useState(0);

  // Load clip data from URL params + API
  useEffect(() => {
    const id = searchParams.get('id');
    const title = searchParams.get('title') || 'Untitled Clip';
    const start = parseFloat(searchParams.get('start') || '0');
    const end = parseFloat(searchParams.get('end') || '60');

    if (!id) return;

    let cancelled = false;
    setIsLoadingMeta(true);
    setMetaError(null);

    (async () => {
      try {
        const [playUrl, clipsResponse] = await Promise.all([
          getClipPlayUrl(id),
          authFetch('/api/video/clips'),
        ]);

        if (cancelled) return;

        if (!clipsResponse.ok) {
          throw new Error(`API error ${clipsResponse.status}`);
        }

        const clips = await clipsResponse.json();
        const clip = clips.find((item: any) => item.id === id);

        setVideoData({
          id,
          url: playUrl,
          title: clip?.metadata?.title || title,
          startTime: start,
          endTime: end,
          words: clip?.metadata?.words || [],
          viralityScore: clip?.metadata?.virality_score,
          intent: clip?.metadata?.generation_intent || clip?.metadata?.intent,
        });
        setTrimIn(start);
        setTrimOut(end);
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
  }, [searchParams]);

  const handleWordEdit = useCallback((index: number, newWord: string) => {
    setVideoData(prev => {
      if (!prev) return null;
      const words = [...prev.words];
      words[index] = { ...words[index], word: newWord };
      return { ...prev, words };
    });
  }, []);

  const handleToggleExcludeWord = useCallback((index: number) => {
    setExcludedWordIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleTrimChange = useCallback((inSec: number, outSec: number) => {
    setTrimIn(inSec + (videoData?.startTime || 0));
    setTrimOut(outSec + (videoData?.startTime || 0));
  }, [videoData?.startTime]);

  const handleExport = useCallback(async (opts: ExportOptions) => {
    if (!videoData?.id) return;
    setIsExporting(true);
    setExportSuccess(false);

    try {
      const fileName = videoData.title
        ? `${videoData.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.mp4`
        : `excerpt-clip-${videoData.id}.mp4`;

      await downloadAuthenticatedClip(videoData.id, fileName, {
        t: Date.now().toString(),
        face_centering: faceCenteringEnabled ? '1' : '0',
        b_roll: bRollEnabled ? '1' : '0',
        captions: captionsEnabled ? '1' : '0',
        aspect_ratio: opts.aspectRatio,
        quality: opts.quality,
        trim_in: String(trimIn),
        trim_out: String(trimOut),
        caption_style: captionStyle,
        crop_offset: String(cropOffset),
        thumbnail_time: thumbnailTime !== null ? String(thumbnailTime) : '',
        thumbnail_title: thumbnailTitle,
      });

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      console.error('Export failed:', err);
      window.alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [videoData, faceCenteringEnabled, bRollEnabled, captionsEnabled, trimIn, trimOut, captionStyle, cropOffset, thumbnailTime, thumbnailTitle]);

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

  return (
    <div className="flex h-screen bg-[#030712] text-[#e0e5f6] overflow-hidden">
      <SidebarNav />

      <main className="flex-grow flex flex-col min-w-0 h-full overflow-hidden">
        {/* ── Top Header ── */}
        <header className="h-16 border-b border-[#1a2235] flex items-center justify-between px-6 bg-[#030712]/80 backdrop-blur-xl shrink-0 z-10">
          <div className="flex items-center gap-4">
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
                <h1 className="text-sm font-bold tracking-tight truncate max-w-[200px] sm:max-w-xs">
                  {videoData?.title || 'Clip Editor'}
                </h1>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[9px] text-[#4b5563] font-black uppercase tracking-widest">Studio Mode</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Clip info pills */}
            {videoData && (
              <>
                <div className="hidden sm:flex px-3 py-1.5 rounded-lg bg-[#111827] border border-[#1f2937] items-center gap-2">
                  <span className="text-[9px] font-black text-[#4b5563] uppercase tracking-widest">Duration</span>
                  <span className="text-[10px] font-bold text-[#e0e5f6]">
                    {Math.floor(clipDuration / 60)}m {Math.floor(clipDuration % 60)}s
                  </span>
                </div>
                {isLoadingMeta && (
                  <div className="flex items-center gap-2 text-[#4b5563]">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:block">Loading transcript</span>
                  </div>
                )}
                {exportSuccess && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30">
                    <span className="text-[9px] font-black text-green-400 uppercase tracking-widest">✓ Exported</span>
                  </div>
                )}
              </>
            )}
          </div>
        </header>

        {/* ── Main Workspace ── */}
        <div className="flex-grow flex overflow-hidden">

          {/* Center: Video + Timeline */}
          <div className="flex-grow flex flex-col min-w-0 overflow-hidden">
            {/* Video area */}
            <div className="flex-grow flex items-center justify-center p-4 lg:p-6 min-h-0 relative bg-[#02060f]">
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
                  cropOffset={cropOffset}
                  socialPreviewMode={socialPreviewMode}
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
            <div className="shrink-0 p-4 lg:px-6 lg:pb-5 border-t border-[#1a2235] bg-[#030712]">
              <Timeline
                duration={clipDuration}
                currentTime={currentTime - (videoData?.startTime || 0)}
                onSeek={t => {
                  const abs = (videoData?.startTime || 0) + t;
                  setManualSeek(abs);
                  setTimeout(() => setManualSeek(null), 50);
                }}
                onTrimChange={handleTrimChange}
              />
            </div>
          </div>

          {/* Transcript panel (xl+) */}
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
            />
          </div>

          {/* Intelligence sidebar (lg+) */}
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
              cropOffset={cropOffset}
              onChangeCropOffset={setCropOffset}
              thumbnailTime={thumbnailTime}
              onSelectThumbnailTime={() => setThumbnailTime(currentTime)}
              thumbnailTitle={thumbnailTitle}
              onChangeThumbnailTitle={setThumbnailTitle}
              readinessScore={readinessScore}
              socialPreviewMode={socialPreviewMode === 'none' ? 'tiktok' : socialPreviewMode}
              onChangeSocialPreviewMode={(mode) => setSocialPreviewMode(prev => prev === mode ? 'none' : mode)}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function EditorPage() {
  return (
    <AuthGate>
      <Suspense
        fallback={
          <div className="h-screen w-screen bg-[#030712] flex items-center justify-center gap-3 text-white">
            <Loader2 size={20} className="animate-spin text-primary" />
            <span className="text-sm font-bold uppercase tracking-widest">Initializing Editor...</span>
          </div>
        }
      >
        <EditorContent />
      </Suspense>
    </AuthGate>
  );
}
