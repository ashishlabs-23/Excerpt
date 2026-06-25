"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Star, Download, Share2, TrendingUp, Loader2, Cpu, DownloadCloud, X, Edit3, Rocket, BookOpen, Lightbulb, Swords, Clipboard, Check, Film } from 'lucide-react';
import { Button } from "@/components/ui/button";
import Link from 'next/link';
import { API_BASE_URL, authFetch, getDirectDownloadUrl, getClipPlayUrl, downloadAuthenticatedClip } from '@/lib/api';
import { AuthenticatedVideo } from '@/components/AuthenticatedVideo';
import { EditorReviewMode } from '@/components/EditorReviewMode';
import { BoundaryTournament } from '@/components/BoundaryTournament';
import { CreateVoiceoverModal } from '@/components/CreateVoiceoverModal';
import { Mic, CheckCircle2 } from 'lucide-react';

interface Clip {
  id: string;
  job_id: string;
  video_url: string;
  thumbnail_url?: string;
  title?: string;
  start_time: number;
  end_time: number;
  content: string;
  created_at?: string;
  metadata?: {
    title?: string;
    virality_score?: number;
    reason?: string;
    generation_mode?: string;
    generation_intent?: string;
    recovery_reason?: string;
    crop_backend?: string;
    nexus?: any;
    clip_score?: number;
  };
}

const intentConfig: Record<string, { label: string; icon: any; color: string }> = {
  viral: { label: 'Viral', icon: Rocket, color: 'text-primary' },
  storyteller: { label: 'Story', icon: BookOpen, color: 'text-amber-400' },
  educational: { label: 'Insight', icon: Lightbulb, color: 'text-emerald-400' },
  action: { label: 'Action', icon: Swords, color: 'text-rose-400' },
  discovery: { label: 'Discovery', icon: Film, color: 'text-cyan-400' },
};

const generationModeLabel: Record<string, string> = {
  ai: "Premium AI",
  heuristic: "Smart Fallback",
  recovery: "Draft Recovery",
};

const generationModeDescription: Record<string, string> = {
  heuristic: "Generated from transcript heuristics because the primary AI service was temporarily unavailable.",
  recovery: "Generated from source timing fallback while AI services were temporarily unavailable.",
};

interface RecentClipsProps {
  clips?: Clip[];
  mode?: 'clips' | 'voiceovers';
}

export const RecentClips: React.FC<RecentClipsProps> = ({ clips, mode = 'clips' }) => {
  const [allClips, setAllClips] = React.useState<Clip[]>(clips || []);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [selectedClip, setSelectedClip] = React.useState<Clip | null>(null);
  const [sharedId, setSharedId] = React.useState<string | null>(null);
  const [copiedMetadataId, setCopiedMetadataId] = React.useState<string | null>(null);
  const [showMockup, setShowMockup] = React.useState(false);
  
  // Voiceover state
  const [voiceoverModalClip, setVoiceoverModalClip] = React.useState<Clip | null>(null);
  const [voiceovers, setVoiceovers] = React.useState<Record<string, any[]>>({});

  const downloadResetTimeoutRef = React.useRef<number | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const handleModalScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const scrollTop = e.currentTarget.scrollTop;
    if (scrollTop > 150) {
      if (!videoRef.current.paused) videoRef.current.pause();
    } else {
      if (videoRef.current.paused) videoRef.current.play().catch(() => {});
    }
  };

  const copySocialMetadata = async (clip: Clip) => {
    const title = clip.metadata?.title || clip.title || "Video Clip";
    const caption = clip.content;
    const hashtags = "#Excerpt #ContentCreator #Viral"; // Standard hashtags
    const text = `${title.toUpperCase()}\n\n${caption}\n\n${hashtags}`;
    
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMetadataId(clip.id);
      setTimeout(() => setCopiedMetadataId(null), 2000);
    } catch (err) {
      console.error('Metadata copy failed:', err);
    }
  };

  const fetchClips = async () => {
    try {
      if (mode === 'voiceovers') {
        const response = await authFetch('/api/voiceover/all');
        if (response.ok) {
          const data = await response.json();
          // Map voiceover_clips to Clip interface
          const mapped = data.filter((v: any) => v.status === 'completed' && v.video_path).map((v: any) => ({
            id: v.id,
            job_id: v.source_clip_id,
            video_url: v.video_path,
            thumbnail_url: v.clips?.thumbnail_url,
            title: `Voiceover: ${v.clips?.title || 'Clip'}`,
            start_time: v.clips?.start_time || 0,
            end_time: v.clips?.end_time || 15,
            content: v.narration_text,
            created_at: v.created_at,
            metadata: {
              title: `[${v.provider.toUpperCase()} TTS] ${v.clips?.title || ''}`,
              generation_mode: 'voiceover',
              generation_intent: 'storyteller'
            }
          }));
          setAllClips(mapped);
        }
      } else {
        const response = await authFetch('/api/video/clips');
        if (response.ok) {
          const data = await response.json();
          setAllClips(data);
        }
      }
    } catch {
      // Silently fail — gallery shows empty state
    }
  };

  const handleShare = async (clip: Clip) => {
    try {
      await navigator.clipboard.writeText(normalizeUrl(clip.video_url));
      setSharedId(clip.id);
      window.setTimeout(() => {
        setSharedId((current) => (current === clip.id ? null : current));
      }, 2000);
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  React.useEffect(() => {
    if (clips && clips.length > 0) {
      // Merge new clips with existing ones, avoiding duplicates
      setAllClips(prevClips => {
        const existingIds = new Set(prevClips.map(c => c.id));
        const newUniqueClips = clips.filter(c => !existingIds.has(c.id));
        return [...newUniqueClips, ...prevClips];
      });
    } else if (clips === undefined) {
      // No prop clips - load persisted clips from the database
      fetchClips();
    }
  }, [clips]);

  React.useEffect(() => {
    return () => {
      if (downloadResetTimeoutRef.current !== null) {
        window.clearTimeout(downloadResetTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (selectedClip) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedClip]);

  const loadVoiceovers = async (clipId: string) => {
    try {
      const res = await authFetch(`/api/voiceover/clip/${clipId}`);
      if (res.ok) {
        let data = await res.json();
        // Force replace host.docker.internal with localhost in all paths
        data = data.map((vo: any) => ({
          ...vo,
          video_path: vo.video_path ? vo.video_path.replace(/host\.docker\.internal/g, 'localhost') : vo.video_path,
          audio_path: vo.audio_path ? vo.audio_path.replace(/host\.docker\.internal/g, 'localhost') : vo.audio_path,
        }));
        setVoiceovers(prev => ({ ...prev, [clipId]: data }));
      }
    } catch (e) {
      console.error('Failed to load voiceovers', e);
    }
  };

  React.useEffect(() => {
    let intervalId: number | null = null;
    
    if (selectedClip) {
      loadVoiceovers(selectedClip.id);
      
      // Poll for updates if any voiceover is pending
      intervalId = window.setInterval(() => {
        setVoiceovers(current => {
          const clipVoiceovers = current[selectedClip.id] || [];
          if (clipVoiceovers.some(vo => vo.status === 'pending' || vo.status === 'generating')) {
            loadVoiceovers(selectedClip.id);
          }
          return current;
        });
      }, 3000);
    }
    
    return () => {
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [selectedClip]);

  const normalizeUrl = (url: string) => {
    if (url.startsWith('http')) return url;
    return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const getDownloadFileName = (clip: Clip) => {
    const baseName = (clip.metadata?.title || clip.title || `excerpt-clip-${clip.id}`)
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    return `${baseName || `excerpt-clip-${clip.id}`}.mp4`;
  };

  const scheduleDownloadReset = (clipId: string) => {
    if (downloadResetTimeoutRef.current !== null) {
      window.clearTimeout(downloadResetTimeoutRef.current);
    }

    downloadResetTimeoutRef.current = window.setTimeout(() => {
      setDownloadingId((current) => (current === clipId ? null : current));
      downloadResetTimeoutRef.current = null;
    }, 2000);
  };

  const handleDownload = async (clip: Clip) => {
    if (downloadingId === clip.id) return;
    setDownloadingId(clip.id);
    try {
      const { getDirectDownloadUrl } = await import('@/lib/api');
      const directUrl = await getDirectDownloadUrl(clip.id);
      window.location.href = directUrl;
      scheduleDownloadReset(clip.id);
    } catch (error) {
      console.error('Download failed:', error);
      window.alert('Clip download failed. Please try again.');
      setDownloadingId(null);
    }
  };

  const handleVoiceoverDownload = (vo: any) => {
    try {
      // Direct navigation to the signed URL with download parameter
      const url = `${vo.video_path.replace('host.docker.internal', 'localhost')}&download=voiceover-${vo.id}.mp4`;
      window.location.href = url;
    } catch (error) {
      console.error('Voiceover download failed:', error);
      window.alert('Voiceover download failed. Please try again.');
    }
  };

  return (
    <div className="mt-16 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tighter text-white uppercase italic">Your Clips</h2>
            <div className="px-2 py-0.5 rounded bg-primary/20 border border-primary/30 text-[10px] font-black text-primary tracking-widest uppercase">Pro</div>
          </div>
          <p className="text-sm font-medium text-white/30 uppercase tracking-[0.2em]">Curated for maximum engagement</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full glass-card border-white/5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-white/40 font-black tracking-widest uppercase">Saved to library</span>
        </div>
      </div>
      
      {allClips.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-8 sm:p-20 rounded-[28px] sm:rounded-[40px] glass-card border-white/5 border-dashed border-2 flex flex-col items-center justify-center text-center group"
        >
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Play className="text-white/20 w-6 h-6 fill-white/10" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2 tracking-tight">Your library is empty</h3>
          <p className="text-xs sm:text-sm text-white/30 max-w-xs leading-relaxed uppercase tracking-widest font-black">Generate some clips to see them here.</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
          <AnimatePresence mode="popLayout">
            {allClips.map((clip, index) => {
              const generationMode = clip.metadata?.generation_mode || "ai";

              return (
              <motion.div 
                key={clip.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => setSelectedClip(clip)}
                className="group relative flex flex-col rounded-[32px] overflow-hidden glass-card border-white/5 hover:border-primary/20 transition-all duration-500 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] cursor-pointer"
              >
                <div className="aspect-[9/16] relative bg-black/40 overflow-hidden">
                  <AuthenticatedVideo
                    clipId={clip.id}
                    fallbackSrc={clip.video_url}
                    poster={clip.thumbnail_url}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 relative z-0"
                    controls={false}
                    loop
                    playsInline
                    preload="none"
                    crossOrigin="anonymous"
                    onMouseOver={(e) => {
                      const video = e.currentTarget;
                      video.muted = false; // Try unmuted first
                      const playPromise = video.play();
                      if (playPromise !== undefined) {
                        playPromise.catch((err) => {
                          // If auto-play blocked because of unmuted, try muted
                          if (err.name === 'NotAllowedError') {
                            video.muted = true;
                            video.play().catch(() => {});
                          }
                        });
                      }
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.pause();
                      e.currentTarget.currentTime = 0;
                    }}
                  />
                  
                  <div className="absolute top-6 left-6 right-6 flex justify-between items-start">
                    <div className="flex flex-col gap-2">
                      <span className="px-3 py-1.5 rounded-full glass-card border-white/10 text-[10px] font-black tracking-[0.2em] text-white uppercase backdrop-blur-2xl">
                        {Math.round(clip.end_time - clip.start_time)}s DURATION
                      </span>
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-card border-emerald-500/20 text-[10px] font-black tracking-[0.2em] text-emerald-400 uppercase backdrop-blur-2xl">
                        <TrendingUp size={10} /> {clip.metadata?.virality_score || 94}% VIRAL
                      </div>
                      {(() => {
                        const runStages = clip.metadata?.nexus?.pipeline_summary?.run || [];
                        const isSports = clip.metadata?.generation_intent === 'sports' || ['football', 'basketball', 'cricket', 'sports'].includes(clip.metadata?.nexus?.category || '');
                        const hasFaceTracking = runStages.includes('stage_face_tracking');
                        
                        let cropLabel = "Face-Tracked Crop";
                        if (isSports) {
                          cropLabel = "Sports Intelligence Crop";
                        } else if (!hasFaceTracking) {
                          cropLabel = "Object Tracked Crop";
                        }
                        
                        return (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-card border-purple-500/20 text-[10px] font-black tracking-[0.2em] text-purple-400 uppercase backdrop-blur-2xl">
                            <Cpu size={10} /> {cropLabel}
                          </div>
                        );
                      })()}
                      {clip.metadata?.clip_score !== undefined && generationMode === "ai" && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-card border-blue-500/20 text-[10px] font-black tracking-[0.2em] text-blue-400 uppercase backdrop-blur-2xl">
                          Reward Ranked
                        </div>
                      )}
                      {generationMode !== "ai" && (
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-card text-[10px] font-black tracking-[0.2em] uppercase backdrop-blur-2xl ${
                          generationMode === "heuristic"
                            ? "border-sky-500/20 text-sky-300"
                            : "border-amber-500/20 text-amber-300"
                        }`}>
                          {generationModeLabel[generationMode] || "Fallback"}
                        </div>
                      )}
                      {clip.metadata?.generation_intent && (
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-card border-white/10 text-[10px] font-black tracking-[0.2em] uppercase backdrop-blur-2xl ${intentConfig[clip.metadata.generation_intent]?.color || 'text-white'}`}>
                          {React.createElement(intentConfig[clip.metadata.generation_intent]?.icon || Rocket, { size: 10 })}
                          {intentConfig[clip.metadata.generation_intent]?.label || 'Clip'}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDownload(clip); }}
                        disabled={downloadingId === clip.id}
                        className={`w-10 h-10 rounded-full glass-card border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all duration-300 ${
                          downloadingId === clip.id ? 'animate-pulse text-emerald-400' : ''
                        }`}
                      >
                        {downloadingId === clip.id ? <Cpu size={16} className="animate-spin" /> : <DownloadCloud size={16} />}
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSelectedClip(clip); }}
                        className="w-10 h-10 rounded-full glass-card border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                        title="Preview Clip"
                      >
                        <Play size={16} />
                      </button>
                      <Link 
                        href={`/editor?id=${clip.id}&title=${encodeURIComponent(clip.title || clip.metadata?.title || '')}&start=${clip.start_time}&end=${clip.end_time}`}
                        onClick={(e) => e.stopPropagation()}
                        className="w-10 h-10 rounded-full glass-card border-white/10 flex items-center justify-center text-white/40 hover:text-primary transition-colors"
                        title="Edit Clip"
                      >
                        <Edit3 size={16} />
                      </Link>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShare(clip);
                        }}
                        className="w-10 h-10 rounded-full glass-card border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                        title="Copy clip link"
                      >
                        {sharedId === clip.id ? (
                          <Star size={16} className="text-emerald-400 fill-emerald-400" />
                        ) : (
                          <Share2 size={16} />
                        )}
                      </button>

                    </div>
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-2xl shadow-primary/40 scale-0 group-hover:scale-100 transition-transform duration-500">
                      <Play size={24} fill="white" className="ml-1" />
                    </div>
                  </div>
                </div>
                
                <div className="p-5 sm:p-8 pb-7 sm:pb-10 flex flex-col flex-grow">
                  <div className="flex flex-col gap-3 mb-6">
                    <h3 className="text-xl font-bold text-white tracking-tight group-hover:text-primary transition-colors duration-300">
                      {clip.title || clip.metadata?.title || "Clip #"+clip.id.slice(0,4)}
                    </h3>
                    <p className="text-[11px] text-white/40 font-medium leading-relaxed line-clamp-2">
                      {clip.content}
                    </p>
                    {clip.metadata?.reason && (
                      <div className="p-3 rounded-xl bg-white/[0.01] border border-white/5 flex items-start gap-2.5 group-hover:border-primary/10 transition-colors duration-300">
                        <Lightbulb size={13} className="text-primary mt-0.5 shrink-0" />
                        <div className="space-y-0.5">
                          <span className="text-[8px] font-black text-white/30 uppercase tracking-widest block">
                            Viral Driver
                          </span>
                          <p className="text-[10px] text-white/50 leading-relaxed font-medium italic">
                            {clip.metadata.reason}
                          </p>
                        </div>
                      </div>
                    )}
                    {generationMode !== "ai" && (
                      <p className={`text-[10px] uppercase tracking-[0.18em] font-bold ${
                        generationMode === "heuristic" ? "text-sky-200/70" : "text-amber-200/70"
                      }`}>
                        {generationModeDescription[generationMode] || generationModeDescription.recovery}
                      </p>
                    )}
                  </div>
                  
                  <div className="mt-auto flex items-center gap-3">
                    <Button 
                      onClick={(e) => { e.stopPropagation(); handleDownload(clip); }}
                      disabled={downloadingId === clip.id}
                      className="flex-grow h-14 rounded-2xl bg-white/[0.03] hover:bg-primary text-white border border-white/5 hover:border-transparent transition-all duration-300 font-bold uppercase tracking-widest text-[10px] group/btn"
                    >
                      {downloadingId === clip.id ? (
                        <Loader2 className="animate-spin mr-2" size={16} />
                      ) : (
                        <Download className="mr-2 w-4 h-4 group-hover/btn:scale-110 transition-transform" />
                      )}
                      {downloadingId === clip.id ? "DOWNLOADING..." : "DOWNLOAD HD"}
                    </Button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleShare(clip);
                      }}
                      className="w-14 h-14 rounded-2xl glass-card border-white/5 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5 transition-all"
                      title="Copy clip link"
                    >
                      <Share2 size={20} />
                    </button>
                  </div>
                </div>

                <div className="absolute -inset-px bg-gradient-to-br from-primary/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
      {/* GODMODE PLAYER MODAL */}
      <AnimatePresence>
        {selectedClip && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-start lg:items-center justify-center overflow-y-auto custom-scrollbar p-4 md:p-8"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedClip(null)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-2xl"
            >
              <div className="absolute inset-0 bg-primary/[0.02] pointer-events-none" />
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onScroll={handleModalScroll}
              className="relative my-auto w-full max-w-6xl max-h-[calc(100svh-1rem)] sm:max-h-[calc(100svh-2rem)] rounded-[32px] sm:rounded-[40px] overflow-y-auto lg:overflow-hidden custom-scrollbar glass-card border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] z-10 flex flex-col lg:flex-row bg-[#050505]"
            >
              <div className="flex-[3] relative bg-black flex items-center justify-center p-4 sm:p-6 lg:p-8 overflow-hidden min-h-[450px] sm:min-h-[550px] lg:min-h-0 sticky top-0 z-0">
                <div className={`${showMockup ? 'iphone-mockup' : 'w-full h-full max-h-[65svh] lg:max-h-none flex items-center justify-center'}`}>
                  <div className={`${showMockup ? 'iphone-bezel' : 'w-full h-full max-w-[min(100%,400px)] lg:max-w-none flex items-center justify-center'}`}>
                    {showMockup && <div className="iphone-notch" />}
                    <AuthenticatedVideo
                      ref={videoRef}
                      clipId={selectedClip.id}
                      fallbackSrc={selectedClip.video_url}
                      key={selectedClip.id}
                      className={`${showMockup ? 'w-full h-full object-cover' : 'h-full w-auto max-w-full object-contain'}`}
                      controls={!showMockup}
                      autoPlay
                      loop
                      crossOrigin="anonymous"
                      playsInline
                      muted={false}
                      onLoadedData={(e) => {
                        e.currentTarget.muted = false;
                        e.currentTarget.volume = 1.0;
                        e.currentTarget.play().catch(() => {});
                      }}
                    />
                    
                    {showMockup && (
                      <div className="social-ui-overlay">
                        <div className="social-action-column">
                          <div className="social-action-icon"><Star size={24} className="fill-emerald-400 text-emerald-400" /></div>
                          <div className="social-action-icon"><Share2 size={24} /></div>
                        </div>
                        <div className="max-w-[70%] mb-4">
                           <div className="flex items-center gap-2 mb-2">
                             <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-black">E</div>
                             <span className="text-xs font-bold text-white">Excerpt_AI</span>
                           </div>
                           <p className="text-[10px] text-white/80 line-clamp-2 leading-tight">
                             {selectedClip.content}
                           </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex-1 flex flex-col glass-card border-none lg:border-l border-white/5 bg-black/60 lg:bg-white/[0.01] overflow-visible lg:overflow-y-auto custom-scrollbar max-h-full relative z-10">
                <div className="flex items-center justify-between gap-2 sm:gap-3 pb-4 sm:pb-6 mb-5 sm:mb-6 sticky top-0 bg-[#050505]/95 backdrop-blur-xl z-20 pt-5 sm:pt-8 px-5 sm:px-8 border-b border-white/5">
                  <span className="px-2.5 py-1 rounded-full bg-primary/20 border border-primary/30 text-[8px] sm:text-[10px] font-black tracking-[0.2em] text-primary uppercase">Clip Preview</span>
                  <div className="flex items-center gap-2 sm:gap-4">
                    <button 
                      onClick={() => setShowMockup(!showMockup)}
                      className={`h-9 sm:h-10 px-3 sm:px-4 rounded-full text-[8px] sm:text-[10px] font-black tracking-widest uppercase transition-all ${
                        showMockup 
                          ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                          : 'bg-white/5 text-white/40 border border-white/10 hover:text-white'
                      }`}
                    >
                      {showMockup ? 'Mockup: ON' : 'Mockup: OFF'}
                    </button>
                    <button 
                      onClick={() => setSelectedClip(null)}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 flex flex-col px-5 sm:px-8 pb-5 sm:pb-8">
                  <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tighter uppercase italic mb-4">
                    {selectedClip.title || selectedClip.metadata?.title || "Moments Detected"}
                  </h3>
                  
                  <div className="flex flex-wrap items-center gap-2 mb-8">
                    <div className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black tracking-[0.2em] text-emerald-400 uppercase">
                      <TrendingUp size={10} /> {selectedClip.metadata?.virality_score || 94}% Viral
                    </div>
                    <div className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/5 border border-white/10 text-[10px] font-black tracking-[0.2em] text-white/60 uppercase">
                      {Math.round(selectedClip.end_time - selectedClip.start_time)}s Length
                    </div>
                    {(() => {
                      const runStages = selectedClip.metadata?.nexus?.pipeline_summary?.run || [];
                      const isSports = selectedClip.metadata?.generation_intent === 'sports' || ['football', 'basketball', 'cricket', 'sports'].includes(selectedClip.metadata?.nexus?.category || '');
                      const hasFaceTracking = runStages.includes('stage_face_tracking');
                      
                      let cropLabel = "Face-Tracked Crop";
                      if (isSports) {
                        cropLabel = "Sports Intelligence Crop";
                      } else if (!hasFaceTracking) {
                        cropLabel = "Object Tracked Crop";
                      }
                      
                      return (
                        <div className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] font-black tracking-[0.2em] text-purple-400 uppercase">
                          <Cpu size={10} /> {cropLabel}
                        </div>
                      );
                    })()}
                    {selectedClip.metadata?.clip_score !== undefined && (selectedClip.metadata?.generation_mode || "ai") === "ai" && (
                      <div className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-black tracking-[0.2em] text-blue-400 uppercase">
                        Reward Ranked
                      </div>
                    )}
                    {(selectedClip.metadata?.generation_mode || "ai") !== "ai" && (
                      <div className={`flex items-center h-8 px-3 rounded-full text-[10px] font-black tracking-[0.2em] uppercase ${
                        (selectedClip.metadata?.generation_mode || "ai") === "heuristic"
                          ? "bg-sky-500/10 border border-sky-500/20 text-sky-300"
                          : "bg-amber-500/10 border border-amber-500/20 text-amber-300"
                      }`}>
                        {generationModeLabel[selectedClip.metadata?.generation_mode || "recovery"] || "Fallback"}
                      </div>
                    )}
                  </div>

                  {selectedClip.metadata?.reason && (
                    <div className="mb-4 p-4 rounded-[16px] bg-emerald-500/5 border border-emerald-500/10 shrink-0">
                      <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Lightbulb size={12} /> Why this clip works
                      </h4>
                      <p className="text-xs text-emerald-300/80 leading-relaxed italic">
                        "{selectedClip.metadata.reason}"
                      </p>
                    </div>
                  )}
                  
                  <div className="mb-8 p-4 rounded-[16px] bg-purple-500/5 border border-purple-500/10 shrink-0">
                    <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Cpu size={12} /> Face Cropping Technology
                    </h4>
                    <p className="text-xs text-white/70 leading-relaxed">
                      Excerpt AI automatically tracks focal zones using a <strong>MediaPipe {selectedClip.metadata?.crop_backend || 'Face Mesh'}</strong> cascade. The 9:16 vertical crop is dynamically smoothed using Kalman filters to keep the active speakers or field action centered.
                    </p>
                  </div>
                  
                  <EditorReviewMode 
                    clipId={selectedClip.id} 
                    jobId={selectedClip.job_id || ''} 
                    predictedStart={selectedClip.start_time || 0}
                    predictedEnd={selectedClip.end_time || 0}
                    narrativeType={selectedClip.metadata?.nexus?.story_type || selectedClip.metadata?.reason || 'Unknown'}
                    publishabilityBefore={selectedClip.metadata?.clip_score || selectedClip.metadata?.virality_score || 0}
                  />

                  {/* V2 Blind A/B Tournament Mode */}
                  <BoundaryTournament 
                    clipId={selectedClip.id} 
                    jobId={selectedClip.job_id || ''}
                    narrativeType={selectedClip.metadata?.nexus?.story_type || selectedClip.metadata?.reason || 'Unknown'}
                  />
                  
                  <p className="text-sm text-white/40 leading-relaxed font-medium mb-10 overflow-y-auto max-h-32 scrollbar-hide shrink-0">
                    {selectedClip.content}
                  </p>

                  {/* Social Preview Interface */}
                  <div className="mb-8 sm:mb-10 p-4 sm:p-6 rounded-[24px] bg-white/[0.02] border border-white/5 relative group/preview shrink-0">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Social Preview</span>
                      <div className="flex gap-1">
                        <div className="w-1 h-1 rounded-full bg-primary/40" />
                        <div className="w-1 h-1 rounded-full bg-primary/40" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="text-[11px] font-black text-white uppercase italic tracking-tight">
                         {selectedClip.title || selectedClip.metadata?.title || "Clip Title"}
                      </div>
                      <div className="text-[10px] text-white/40 line-clamp-2 leading-relaxed italic">
                        {selectedClip.content}
                      </div>
                      <div className="text-[9px] text-primary/60 font-black tracking-widest uppercase">
                        {selectedClip.metadata?.generation_intent ? `#${selectedClip.metadata.generation_intent} ` : ''}#Excerpt #Viral
                      </div>
                    </div>
                  </div>
                  {(selectedClip.metadata?.generation_mode || "ai") !== "ai" && (
                    <p className={`text-xs leading-relaxed mb-8 shrink-0 ${
                      (selectedClip.metadata?.generation_mode || "ai") === "heuristic"
                        ? "text-sky-100/70"
                        : "text-amber-100/70"
                    }`}>
                      {selectedClip.metadata?.recovery_reason || generationModeDescription[selectedClip.metadata?.generation_mode || "recovery"]}
                    </p>
                  )}
                  
                  <div className="mt-6 sm:mt-8 flex flex-col gap-3 shrink-0">
                    <Button 
                      onClick={() => handleDownload(selectedClip)}
                      disabled={downloadingId === selectedClip.id}
                      className="w-full h-16 rounded-2xl bg-primary hover:bg-primary/80 text-white border-none transition-all duration-300 font-bold uppercase tracking-widest text-xs shadow-xl shadow-primary/20 shrink-0"
                    >
                      {downloadingId === selectedClip.id ? <Loader2 className="animate-spin mr-2" size={18} /> : <Download className="mr-2 w-5 h-5" />}
                      {downloadingId === selectedClip.id ? "DOWNLOADING VIDEO..." : "DOWNLOAD CLIP"}
                    </Button>
                    
                    <div className="grid grid-cols-1 gap-2">
                      <Link 
                        href={`/editor?id=${selectedClip.id}&title=${encodeURIComponent(selectedClip.title || selectedClip.metadata?.title || '')}&start=${selectedClip.start_time}&end=${selectedClip.end_time}`}
                        className="block"
                      >
                        <Button 
                          variant="outline"
                          className="w-full h-14 rounded-2xl bg-white/5 hover:bg-primary/20 text-primary border-primary/30 transition-all font-bold uppercase tracking-widest text-[10px]"
                        >
                          <Edit3 size={18} className="mr-2" /> Open in Editor
                        </Button>
                      </Link>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Button 
                          variant="outline"
                          className="h-14 rounded-2xl bg-primary/5 hover:bg-primary/10 text-primary border-primary/20 transition-all font-bold uppercase tracking-widest text-[10px]"
                          onClick={() => copySocialMetadata(selectedClip)}
                        >
                          {copiedMetadataId === selectedClip.id ? <Check size={16} className="mr-2 text-emerald-400" /> : <Clipboard size={16} className="mr-2" />}
                          {copiedMetadataId === selectedClip.id ? 'Copied' : 'Metadata'}
                        </Button>
                        <Button 
                          variant="outline"
                          className="h-14 rounded-2xl bg-indigo-500/5 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/20 transition-all font-bold uppercase tracking-widest text-[10px]"
                          onClick={() => setVoiceoverModalClip(selectedClip)}
                        >
                          <Mic size={16} className="mr-2" /> Add Voiceover
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Voiceovers Section */}
                  {(voiceovers[selectedClip.id] && voiceovers[selectedClip.id].length > 0) && (
                    <div className="mt-8 pt-8 border-t border-white/5 shrink-0">
                      <h4 className="text-sm font-bold text-white mb-4 uppercase tracking-widest flex items-center gap-2">
                        <Mic size={16} className="text-indigo-400" /> Derived Voiceovers
                      </h4>
                      <div className="space-y-3">
                        {voiceovers[selectedClip.id].map((vo: any) => (
                          <div key={vo.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                            <div>
                              <div className="text-xs font-bold text-white uppercase tracking-wider">{vo.provider}</div>
                              <div className="text-[10px] text-white/50">{vo.status === 'completed' ? 'Ready' : vo.status}</div>
                            </div>
                            <div className="flex gap-2">
                              {vo.status === 'completed' && vo.video_path && (
                                <button 
                                  onClick={(e) => { e.preventDefault(); handleVoiceoverDownload(vo); }} 
                                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors text-white"
                                  title="Download Voiceover"
                                >
                                  <DownloadCloud size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {voiceoverModalClip && (
          <CreateVoiceoverModal
            clip={voiceoverModalClip}
            onClose={() => setVoiceoverModalClip(null)}
            onSuccess={() => {
              loadVoiceovers(voiceoverModalClip.id);
              setVoiceoverModalClip(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
