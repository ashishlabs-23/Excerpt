'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SidebarNav } from '@/components/SidebarNav';
import { VoiceoverSegmentEditor, VoiceoverSegment } from '@/components/VoiceoverSegmentEditor';
import { VoiceEnginePanel } from '@/components/VoiceEnginePanel';
import { VoicePipelineStatus } from '@/components/VoicePipelineStatus';
import { AuthenticatedVideo } from '@/components/AuthenticatedVideo';
import { authFetch } from '@/lib/api';
import { AuthGate } from '@/components/AuthGate';
import {
  Play,
  Download,
  AlertTriangle,
  Sparkles,
  Globe,
  Wand2,
  Loader2,
  Film,
  CheckCircle2,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import { RecentClips } from '@/components/RecentClips';

export interface LocalVoiceConfig {
  provider?: 'google' | 'openai' | 'elevenlabs';
  voiceId?: string;
  gender?: 'NEUTRAL' | 'FEMALE' | 'MALE';
  speakingRate?: number;
  pitch?: number;
  volumeGainDb?: number;
  excitement?: number;
  energy?: number;
  drama?: number;
}

interface ClipOption {
  id: string;
  title?: string;
  video_url: string;
  thumbnail_url?: string;
  start_time: number;
  end_time: number;
  content?: string;
  summary?: string;
  created_at?: string;
}

const REWRITE_MODES = [
  { id: 'football_commentary', name: 'Sports Commentary', desc: 'High energy play-by-play commentary' },
  { id: 'viral_shorts', name: 'Viral Hook', desc: 'Attention-grabbing short-form hook' },
  { id: 'documentary', name: 'Documentary', desc: 'Deep narrative storytelling tone' },
  { id: 'tactical_analysis', name: 'Tactical Analysis', desc: 'In-depth tactical breakdown' },
  { id: 'youtube_narrator', name: 'YouTube Narrator', desc: 'Engaging creator narration tone' },
  { id: 'custom_prompt', name: 'Custom Persona', desc: 'Custom instructions or personality' },
];

const LANGUAGES = [
  { code: 'English', name: 'English', flag: '🇺🇸' },
  { code: 'Spanish', name: 'Spanish', flag: '🇪🇸' },
  { code: 'Hindi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'French', name: 'French', flag: '🇫🇷' },
  { code: 'German', name: 'German', flag: '🇩🇪' },
  { code: 'Portuguese', name: 'Portuguese', flag: '🇧🇷' },
  { code: 'Arabic', name: 'Arabic', flag: '🇦🇪' },
];

const STAGE_MAP: Record<string, { stage: string; progress: number }> = {
  pending: { stage: 'V1', progress: 20 },
  generating_audio: { stage: 'V3', progress: 45 },
  merging: { stage: 'V7', progress: 70 },
  uploading: { stage: 'V9', progress: 85 },
  validating_assets: { stage: 'V8', progress: 95 },
  completed: { stage: 'V10', progress: 100 },
};

export default function VoiceoverStudio() {
  // Source Clip Management
  const [clips, setClips] = useState<ClipOption[]>([]);
  const [loadingClips, setLoadingClips] = useState(false);
  const [selectedClip, setSelectedClip] = useState<ClipOption | null>(null);
  const [showClipPicker, setShowClipPicker] = useState(false);
  const [manualClipId, setManualClipId] = useState('');

  // Script & Segments
  const [segments, setSegments] = useState<VoiceoverSegment[]>([]);
  const [rewriteMode, setRewriteMode] = useState<string>('football_commentary');
  const [selectedLang, setSelectedLang] = useState<string>('English');
  const [customInstruction, setCustomInstruction] = useState('');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  // Voice Engine State
  const [voiceConfig, setVoiceConfig] = useState<LocalVoiceConfig>({
    provider: 'elevenlabs',
    gender: 'NEUTRAL',
    speakingRate: 1.0,
    volumeGainDb: 0,
    excitement: 0.8,
    energy: 0.7,
    drama: 0.6,
  });

  // Pipeline Execution State
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeVoiceoverId, setActiveVoiceoverId] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [refreshGalleryKey, setRefreshGalleryKey] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch user clips on mount
  useEffect(() => {
    const fetchUserClips = async () => {
      setLoadingClips(true);
      try {
        const res = await authFetch('/api/video/clips');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setClips(data);
            // Default to first clip
            selectClip(data[0]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch clips:', err);
      } finally {
        setLoadingClips(false);
      }
    };

    fetchUserClips();
  }, []);

  const selectClip = (clip: ClipOption) => {
    setSelectedClip(clip);
    setShowClipPicker(false);
    setOutputUrl(null);
    setStatus('idle');
    setCurrentStage(null);
    setProgress(0);

    const clipDuration = Math.max(1, Math.round(clip.end_time - clip.start_time));
    setSegments([
      {
        id: crypto.randomUUID(),
        start_time: 0,
        end_time: Math.min(clipDuration, 8),
        narration_text: clip.content || clip.summary || clip.title || '',
        clip_type: 'narration',
      },
    ]);
  };

  const handleManualClipSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualClipId.trim()) return;
    const existing = clips.find(c => c.id === manualClipId.trim());
    if (existing) {
      selectClip(existing);
    } else {
      selectClip({
        id: manualClipId.trim(),
        title: `Clip ${manualClipId.trim().slice(0, 8)}`,
        video_url: '',
        start_time: 0,
        end_time: 30,
      });
    }
  };

  // Poll voiceover clip status
  useEffect(() => {
    if (!activeVoiceoverId || status === 'completed' || status === 'failed') return;

    const interval = setInterval(async () => {
      try {
        const res = await authFetch(`/api/voiceover/detail/${activeVoiceoverId}`);
        if (res.ok) {
          const data = await res.json();
          const backendStatus = data.status;

          if (STAGE_MAP[backendStatus]) {
            setCurrentStage(STAGE_MAP[backendStatus].stage);
            setProgress(STAGE_MAP[backendStatus].progress);
          }

          if (backendStatus === 'completed' && data.video_path) {
            setStatus('completed');
            setProgress(100);
            setCurrentStage('V10');
            setOutputUrl(data.video_path);
            setRefreshGalleryKey(prev => prev + 1);
          } else if (backendStatus === 'failed') {
            setStatus('failed');
            setErrorMessage(data.error_message || 'Voiceover synthesis failed');
          }
        }
      } catch (err) {
        console.error('Error polling voiceover status:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeVoiceoverId, status]);

  // Real AI Script Generation
  const handleGenerateScript = async () => {
    if (!selectedClip) return;
    setIsGeneratingScript(true);
    try {
      const res = await authFetch('/api/voiceover/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style: rewriteMode,
          language: selectedLang,
          contextText: selectedClip.content || selectedClip.summary || selectedClip.title || '',
          customInstruction: rewriteMode === 'custom_prompt' ? customInstruction : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate AI script');
      }

      const data = await res.json();
      const clipDuration = Math.max(1, Math.round(selectedClip.end_time - selectedClip.start_time));

      setSegments([
        {
          id: crypto.randomUUID(),
          start_time: 0,
          end_time: Math.min(clipDuration, 10),
          narration_text: data.script,
          clip_type: 'narration',
        },
      ]);
    } catch (err: any) {
      alert(err.message || 'Error generating script');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // Synthesize & Dub Pipeline Execution
  const handleRender = async () => {
    if (!selectedClip) {
      alert('Please select a source clip first.');
      return;
    }
    if (!voiceConfig.voiceId) {
      alert('Please select a voice model in the Voice Engine panel.');
      return;
    }

    const narrationText = segments
      .map(s => s.narration_text.trim())
      .filter(Boolean)
      .join(' ');

    if (narrationText.length < 10) {
      alert('Narration script is too short. Please enter at least 10 characters.');
      return;
    }

    setStatus('processing');
    setProgress(15);
    setCurrentStage('V1');
    setErrorMessage(null);
    setOutputUrl(null);

    try {
      const res = await authFetch(`/api/voiceover/clip/${selectedClip.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: voiceConfig.provider || 'elevenlabs',
          voice: voiceConfig.voiceId,
          narrationText,
          scriptMode: 'ai_generated',
          style: rewriteMode,
          language: selectedLang,
          voiceConfig: {
            speakingRate: voiceConfig.speakingRate,
            pitch: voiceConfig.pitch,
            volumeGainDb: voiceConfig.volumeGainDb,
            excitement: voiceConfig.excitement,
            energy: voiceConfig.energy,
            drama: voiceConfig.drama,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to queue voiceover');
      }

      const data = await res.json();
      setActiveVoiceoverId(data.id);
      setProgress(25);
      setCurrentStage('V3');
    } catch (err: any) {
      setStatus('failed');
      setErrorMessage(err.message || 'Failed to initiate dubbing pipeline');
    }
  };

  const clipDuration = selectedClip
    ? Math.max(1, Math.round(selectedClip.end_time - selectedClip.start_time))
    : 60;

  return (
    <AuthGate>
      <div className="min-h-screen flex bg-black overflow-hidden font-sans text-white/90 selection:bg-primary/30">
        <SidebarNav />

        <main className="flex-1 flex flex-col h-screen overflow-y-auto custom-scrollbar relative">
          {/* Studio Header */}
          <header className="h-20 shrink-0 border-b border-white/5 flex items-center justify-between px-8 bg-[#030712] relative z-20">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">
                Neural Voiceover <span className="text-primary">Studio</span>
              </h1>
              <p className="text-white/40 text-xs font-bold tracking-[0.2em] uppercase mt-1">
                AI Scripting, Voice Cloning & Video Dubbing
              </p>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleRender}
                disabled={!selectedClip || segments.length === 0 || status === 'processing'}
                className="h-10 px-6 rounded-xl bg-gradient-to-r from-primary to-orange-500 hover:from-primary hover:to-orange-400 text-white font-black text-xs uppercase tracking-[0.1em] transition-all shadow-[0_0_20px_rgba(200,119,64,0.3)] disabled:opacity-50 flex items-center gap-2"
              >
                {status === 'processing' ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Synthesizing...
                  </>
                ) : (
                  <>
                    <Play size={14} fill="currentColor" /> Synthesize & Dub
                  </>
                )}
              </button>
              {outputUrl && (
                <a
                  href={outputUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="h-10 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-2 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                >
                  <Download size={14} /> Download Dubbed MP4
                </a>
              )}
            </div>
          </header>

          {/* Studio Workspace */}
          <div className="flex-none p-6" style={{ minHeight: 'calc(100vh - 80px)' }}>
            <div className="h-full flex gap-6">
              {/* Left Column: Video Preview, Script Generator, Segments Timeline */}
              <div className="flex flex-col gap-6 w-[55%] h-full">
                {/* Source Clip Header & Selector */}
                <div className="shrink-0 p-5 bg-[#030712] rounded-3xl border border-white/10 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Film size={14} className="text-primary" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-white/60">
                        Project Source Clip
                      </h3>
                    </div>
                    {clips.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowClipPicker(!showClipPicker)}
                        className="text-[10px] font-black uppercase tracking-wider text-primary hover:text-orange-400 flex items-center gap-1 transition-colors"
                      >
                        <SlidersHorizontal size={12} /> {showClipPicker ? 'Close Picker' : 'Choose Different Clip'}
                      </button>
                    )}
                  </div>

                  {/* Clip Selection Card */}
                  {selectedClip ? (
                    <div className="flex items-center justify-between bg-black/40 border border-white/5 rounded-2xl p-3.5 relative z-10">
                      <div className="flex items-center gap-3 truncate">
                        <div className="w-8 h-8 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          ▶
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-bold text-white truncate">
                            {selectedClip.title || `Clip #${selectedClip.id.slice(0, 8)}`}
                          </div>
                          <div className="text-[10px] font-mono text-white/40">
                            Duration: {clipDuration}s • ID: {selectedClip.id.slice(0, 8)}
                          </div>
                        </div>
                      </div>
                      <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md shrink-0 ml-3">
                        Clip Loaded
                      </span>
                    </div>
                  ) : (
                    <form onSubmit={handleManualClipSubmit} className="flex gap-3 relative z-10">
                      <input
                        type="text"
                        placeholder="Paste Clip ID or Video Reference..."
                        value={manualClipId}
                        onChange={(e) => setManualClipId(e.target.value)}
                        className="flex-1 h-12 bg-black/40 border border-white/10 rounded-xl px-4 text-xs text-white focus:border-primary/50 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="h-12 px-6 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs uppercase tracking-wider transition-colors"
                      >
                        Load Clip
                      </button>
                    </form>
                  )}

                  {/* Dropdown Library Picker */}
                  {showClipPicker && clips.length > 0 && (
                    <div className="mt-3 p-3 bg-black/80 border border-white/10 rounded-2xl space-y-2 max-h-56 overflow-y-auto custom-scrollbar animate-fadeIn">
                      <div className="text-[9px] font-bold uppercase tracking-widest text-white/40 mb-2 px-1">
                        Select from your Clip Library:
                      </div>
                      {clips.map(clip => (
                        <div
                          key={clip.id}
                          onClick={() => selectClip(clip)}
                          className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                            selectedClip?.id === clip.id
                              ? 'bg-primary/20 border-primary/40 text-white'
                              : 'bg-white/[0.02] border-white/5 text-white/60 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <div className="truncate mr-3">
                            <div className="text-xs font-bold truncate">{clip.title || `Clip #${clip.id.slice(0, 8)}`}</div>
                            <div className="text-[10px] opacity-50 font-mono">
                              {Math.round(clip.end_time - clip.start_time)}s • {clip.created_at ? new Date(clip.created_at).toLocaleDateString() : 'Recent'}
                            </div>
                          </div>
                          {selectedClip?.id === clip.id && (
                            <CheckCircle2 size={16} className="text-primary shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Video Preview Player */}
                {selectedClip && (
                  <div className="shrink-0 rounded-3xl bg-[#030712] border border-white/10 p-4 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="text-[10px] font-black uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                        <Film size={12} className="text-primary" />
                        {outputUrl ? 'Dubbed Video Preview (Render Complete)' : 'Source Video Preview'}
                      </div>
                      {outputUrl && (
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          Audio Substituted
                        </span>
                      )}
                    </div>
                    <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black relative border border-white/5">
                      <AuthenticatedVideo
                        ref={videoRef}
                        clipId={outputUrl ? '' : selectedClip.id}
                        fallbackSrc={outputUrl || selectedClip.video_url}
                        controls
                        playsInline
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                )}

                {/* AI Script Rewrite Engine */}
                {selectedClip && (
                  <div className="shrink-0 p-5 bg-[#030712] rounded-3xl border border-white/10 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wand2 size={14} className="text-primary" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-white/50">
                          AI Script Generator
                        </h3>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-white/30">
                        Powered by Neural Scripting
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-white/40 font-bold uppercase tracking-wider block">
                          Narrative Style
                        </label>
                        <select
                          value={rewriteMode}
                          onChange={(e) => setRewriteMode(e.target.value)}
                          className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:border-primary/50 focus:outline-none cursor-pointer"
                        >
                          {REWRITE_MODES.map(mode => (
                            <option key={mode.id} value={mode.id} className="bg-[#030712] text-white">
                              {mode.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] text-white/40 font-bold uppercase tracking-wider block">
                          Language
                        </label>
                        <select
                          value={selectedLang}
                          onChange={(e) => setSelectedLang(e.target.value)}
                          className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:border-primary/50 focus:outline-none cursor-pointer"
                        >
                          {LANGUAGES.map(lang => (
                            <option key={lang.code} value={lang.code} className="bg-[#030712] text-white">
                              {lang.flag} {lang.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {rewriteMode === 'custom_prompt' && (
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-white/40 font-bold uppercase tracking-wider block">
                          Persona / Instructions
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Act like an enthusiastic British Premier League commentator"
                          value={customInstruction}
                          onChange={(e) => setCustomInstruction(e.target.value)}
                          className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:border-primary/50 focus:outline-none"
                        />
                      </div>
                    )}

                    <button
                      onClick={handleGenerateScript}
                      disabled={isGeneratingScript}
                      className="w-full h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                      {isGeneratingScript ? (
                        <>
                          <Loader2 size={13} className="animate-spin text-primary" /> Synthesizing AI Script...
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} className="text-primary" /> Auto-Generate Narration
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Segments Timeline Editor */}
                <div className="flex-grow min-h-[380px] relative">
                  {selectedClip ? (
                    <VoiceoverSegmentEditor
                      segments={segments}
                      onChange={setSegments}
                      duration={clipDuration}
                    />
                  ) : (
                    <div className="h-full rounded-3xl border border-white/5 border-dashed flex flex-col items-center justify-center text-center opacity-50 bg-[#030712]/50 p-8">
                      <AlertTriangle size={32} className="mb-4 opacity-20 text-primary" />
                      <p className="text-xs font-black text-white/40 uppercase tracking-widest">
                        Select or Load a Clip to Edit Timeline
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Engine + Status */}
              <div className="flex flex-col gap-6 w-[45%] h-full">
                {/* Voice Configurations & Audition */}
                <div className="flex-grow min-h-0">
                  <VoiceEnginePanel
                    voiceConfig={voiceConfig}
                    onChange={setVoiceConfig}
                  />
                </div>

                {/* Rendering Status */}
                <div className="h-[220px] shrink-0">
                  <VoicePipelineStatus
                    status={status}
                    currentStage={currentStage}
                    progress={progress}
                    error={errorMessage}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Gallery below Studio */}
          <div className="px-6 pb-20 border-t border-white/5 bg-[#030712] pt-8">
            <h2 className="text-2xl font-black tracking-tight text-white uppercase italic mb-6">
              Generated Voiceovers
            </h2>
            <RecentClips key={refreshGalleryKey} mode="voiceovers" />

            <div className="mt-16 pt-8 border-t border-white/5">
              <h2 className="text-2xl font-black tracking-tight text-white uppercase italic mb-6">
                Source Clips
              </h2>
              <RecentClips mode="clips" />
            </div>
          </div>
        </main>
      </div>
    </AuthGate>
  );
}
