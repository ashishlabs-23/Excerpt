'use client';

import React, { useState, useEffect } from 'react';
import { SidebarNav } from '@/components/SidebarNav';
import { VoiceoverSegmentEditor, VoiceoverSegment } from '@/components/VoiceoverSegmentEditor';
import { VoiceEnginePanel } from '@/components/VoiceEnginePanel';
import { VoicePipelineStatus } from '@/components/VoicePipelineStatus';
import { authFetch } from '@/lib/api';
import { AuthGate } from '@/components/AuthGate';
import { Play, Download, AlertTriangle, Sparkles, Languages, Globe, Wand2, Loader2 } from 'lucide-react';
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

const REWRITE_MODES = [
  { id: 'sports_commentary', name: 'Sports Commentary', desc: 'High energy play-by-play commentary' },
  { id: 'viral', name: 'Viral Hook', desc: 'Attention-grabbing short-form hook' },
  { id: 'documentary', name: 'Documentary', desc: 'Deep narrative storytelling tone' },
  { id: 'storytelling', name: 'Dramatic Story', desc: 'Tense narrative build-up' },
  { id: 'news', name: 'Anchor News', desc: 'Professional, direct reporting tone' },
];

const LANGUAGES = [
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'ar', name: 'Arabic', flag: '🇦🇪' },
  { code: 'pt', name: 'Portuguese', flag: '🇧🇷' },
];

export default function VoiceoverStudio() {
  const [sourceUrl, setSourceUrl] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [segments, setSegments] = useState<VoiceoverSegment[]>([]);
  const [voiceConfig, setVoiceConfig] = useState<LocalVoiceConfig>({
    provider: 'elevenlabs',
    gender: 'NEUTRAL',
    speakingRate: 1.0,
    volumeGainDb: 0,
    excitement: 0.8,
    energy: 0.7,
    drama: 0.6,
  });

  const [rewriteMode, setRewriteMode] = useState<string>('sports_commentary');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);

  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  // Poll job status
  useEffect(() => {
    if (!jobId || status === 'completed' || status === 'failed') return;

    const interval = setInterval(async () => {
      try {
        const res = await authFetch(`/api/video/status/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status as any);
          setProgress(data.progress || 0);
          if (data.current_stage) setCurrentStage(data.current_stage);
          if (data.status === 'completed' && data.result?.output_url) {
            setOutputUrl(data.result.output_url);
          }
        }
      } catch (err) {}
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, status]);

  const handleStartProject = async () => {
    if (!sourceUrl) return alert('Enter a video URL first');
    
    try {
      const res = await authFetch('/api/voiceover/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        setProjectId(data.id);
      } else {
        alert('Failed to start project');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateScript = () => {
    if (!projectId) return;
    setIsGeneratingScript(true);
    setTimeout(() => {
      let scriptText = '';
      switch (rewriteMode) {
        case 'viral':
          scriptText = "This is the single mistake that costs creators millions. Watch carefully what happens when he ignores the score.";
          break;
        case 'documentary':
          scriptText = "In the heart of the championship, pressure reaches an all-time high. Portugal needed a hero, and they got one.";
          break;
        case 'news':
          scriptText = "Breaking updates from the field: Ronaldo seals the match with an unbelievable stoppage-time volley.";
          break;
        case 'sports_commentary':
        default:
          scriptText = "UNBELIEVABLE! Ronaldo receives it, cuts inside, AND VOLLEYS IT INTO THE TOP CORNER! Absolute scenes here in stoppage time!";
          break;
      }
      setSegments([
        {
          id: crypto.randomUUID(),
          start_time: 0,
          end_time: 8.5,
          narration_text: scriptText,
          clip_type: 'narration',
        }
      ]);
      setIsGeneratingScript(false);
    }, 1200);
  };

  const handleToggleLang = (langCode: string) => {
    setSelectedLangs(prev => 
      prev.includes(langCode) ? prev.filter(c => c !== langCode) : [...prev, langCode]
    );
  };

  const handleRender = async () => {
    if (!projectId) return;

    await authFetch(`/api/voiceover/project/${projectId}/segments`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segments }),
    });

    setStatus('processing');
    setProgress(0);
    setCurrentStage('Synthesizing Voices');
    try {
      const res = await authFetch(`/api/voiceover/project/${projectId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceConfig, selectedLangs }),
      });
      if (res.ok) {
        const data = await res.json();
        setJobId(data.jobId);
      } else {
        setStatus('failed');
      }
    } catch (err) {
      setStatus('failed');
    }
  };

  return (
    <AuthGate>
      <div className="min-h-screen flex bg-black overflow-hidden font-sans text-white/90 selection:bg-primary/30">
        <SidebarNav />

        <main className="flex-1 flex flex-col h-screen overflow-y-auto custom-scrollbar relative">
          {/* Header */}
          <header className="h-20 shrink-0 border-b border-white/5 flex items-center justify-between px-8 bg-[#030712] relative z-20">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">
                Neural Voiceover <span className="text-primary">Studio</span>
              </h1>
              <p className="text-white/40 text-xs font-bold tracking-[0.2em] uppercase mt-1">
                AI-Powered Cinematic Narration
              </p>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleRender}
                disabled={!projectId || segments.length === 0 || status === 'processing'}
                className="h-10 px-6 rounded-xl bg-gradient-to-r from-primary to-orange-500 hover:from-primary hover:to-orange-400 text-white font-black text-xs uppercase tracking-[0.1em] transition-all shadow-[0_0_20px_rgba(200,119,64,0.3)] disabled:opacity-50 flex items-center gap-2"
              >
                <Play size={14} fill="currentColor" /> Synthesize & Dub
              </button>
              {outputUrl && (
                <a
                  href={outputUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-2 border border-white/10"
                >
                  <Download size={14} /> Download MP4
                </a>
              )}
            </div>
          </header>

          {/* Studio Workspace */}
          <div className="flex-none p-6" style={{ minHeight: 'calc(100vh - 80px)' }}>
            <div className="h-full flex gap-6">
              
              {/* Left Column: Source + AI script + Timeline */}
              <div className="flex flex-col gap-6 w-[55%] h-full">
                {/* Source Input */}
                <div className="shrink-0 p-5 bg-[#030712] rounded-3xl border border-white/10 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-white/40 mb-3">Project Source Clip</h3>
                  {!projectId ? (
                    <div className="flex gap-3 relative z-10">
                      <input
                        type="text"
                        placeholder="Paste YouTube URL or clip identifier..."
                        value={sourceUrl}
                        onChange={(e) => setSourceUrl(e.target.value)}
                        className="flex-1 h-12 bg-black/40 border border-white/10 rounded-xl px-4 text-xs text-white focus:border-primary/50 focus:outline-none"
                      />
                      <button
                        onClick={handleStartProject}
                        className="h-12 px-6 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs uppercase tracking-wider transition-colors"
                      >
                        Start Project
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl p-3 px-4 relative z-10">
                      <span className="text-xs text-emerald-400 font-mono truncate">{sourceUrl}</span>
                      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest bg-white/5 px-2 py-1 rounded-md">Project Active</span>
                    </div>
                  )}
                </div>

                {/* AI Script Rewrite Engine */}
                {projectId && (
                  <div className="shrink-0 p-5 bg-[#030712] rounded-3xl border border-white/10 space-y-4">
                    <div className="flex items-center gap-2">
                      <Wand2 size={14} className="text-primary" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-white/40">AI Script Generator</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-[9px] text-white/40 font-bold uppercase tracking-wider block">Script Narrative Mode</label>
                        <select
                          value={rewriteMode}
                          onChange={(e) => setRewriteMode(e.target.value)}
                          className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:border-primary/50 focus:outline-none cursor-pointer"
                        >
                          {REWRITE_MODES.map(mode => (
                            <option key={mode.id} value={mode.id} className="bg-[#030712] text-white">{mode.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-end">
                        <button
                          onClick={handleGenerateScript}
                          disabled={isGeneratingScript}
                          className="w-full h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                        >
                          {isGeneratingScript ? (
                            <>
                              <Loader2 size={12} className="animate-spin" /> Rewriting...
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} className="text-primary" /> Generate Narration
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Segments Timeline */}
                <div className="flex-grow min-h-0 relative">
                  {projectId ? (
                    <VoiceoverSegmentEditor
                      segments={segments}
                      onChange={setSegments}
                      duration={60}
                    />
                  ) : (
                    <div className="h-full rounded-3xl border border-white/5 border-dashed flex flex-col items-center justify-center text-center opacity-50 bg-[#030712]/50">
                      <AlertTriangle size={32} className="mb-4 opacity-20 text-primary" />
                      <p className="text-xs font-black text-white/40 uppercase tracking-widest">Activate Source to Edit timeline</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Engine + Dubbing + Status */}
              <div className="flex flex-col gap-6 w-[45%] h-full">
                {/* Voice configurations */}
                <div className="flex-grow min-h-0">
                  <VoiceEnginePanel
                    voiceConfig={voiceConfig}
                    onChange={setVoiceConfig}
                  />
                </div>

                {/* Multi-language Dubbing panel */}
                {projectId && (
                  <div className="shrink-0 p-5 bg-[#030712] rounded-3xl border border-white/10 space-y-4">
                    <div className="flex items-center gap-2">
                      <Globe size={14} className="text-indigo-400" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-white/40">Multi-Language Dubbing Grid</h3>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {LANGUAGES.map(lang => {
                        const isSelected = selectedLangs.includes(lang.code);
                        return (
                          <button
                            key={lang.code}
                            onClick={() => handleToggleLang(lang.code)}
                            className={`p-2.5 rounded-xl border flex items-center gap-2 transition-all ${
                              isSelected
                                ? 'bg-indigo-500/10 border-indigo-500/40 text-white font-bold'
                                : 'bg-white/[0.01] border-white/5 text-white/40 hover:bg-white/5'
                            }`}
                          >
                            <span className="text-sm">{lang.flag}</span>
                            <span className="text-[10px] uppercase tracking-wider">{lang.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Rendering Status */}
                <div className="h-[180px] shrink-0">
                  <VoicePipelineStatus
                    status={status}
                    currentStage={currentStage}
                    progress={progress}
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
            <RecentClips mode="voiceovers" />
            
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
