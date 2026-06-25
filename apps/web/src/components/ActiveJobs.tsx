"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Cpu, Hourglass, CheckCircle2, AlertCircle, Play, XCircle, RotateCcw, Film, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { authFetch } from '@/lib/api';

interface Job {
  id: string;
  status: string;
  progress: number;
  video_url: string;
  job_type?: string;
  failed_reason?: string;
  payload?: {
    intent?: string;
    numClips?: number;
  };
  created_at: string;
}

export const ActiveJobs: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const fetchJobs = async () => {
    try {
      const response = await authFetch('/api/video/jobs');
      if (response.ok) {
        const data = await response.json();
        setJobs(data);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    } finally {
      setIsInitialLoad(false);
    }
  };

  const updateArrowVisibility = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setShowLeftArrow(scrollLeft > 10);
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    updateArrowVisibility();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', updateArrowVisibility);
      window.addEventListener('resize', updateArrowVisibility);
    }
    return () => {
      if (container) {
        container.removeEventListener('scroll', updateArrowVisibility);
      }
      window.removeEventListener('resize', updateArrowVisibility);
    };
  }, [jobs]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 340; // Approx card width + gap
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      // Delay check slightly to wait for scroll completion
      setTimeout(updateArrowVisibility, 300);
    }
  };

  const handleCancel = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoadingId(`${jobId}-cancel`);
    try {
      const res = await authFetch(`/api/video/jobs/${jobId}/cancel`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchJobs();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRetry = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionLoadingId(`${jobId}-retry`);
    try {
      const res = await authFetch(`/api/video/jobs/${jobId}/retry`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchJobs();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRestart = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to restart this video project? This will purge all previously generated clips.')) {
      return;
    }
    setActionLoadingId(`${jobId}-restart`);
    try {
      const res = await authFetch(`/api/video/jobs/${jobId}/restart`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchJobs();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const getProjectName = (url: string) => {
    if (!url) return "Untitled Video";
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
        const v = parsed.searchParams.get('v');
        return `YouTube Video (${v || 'Source'})`;
      }
      const parts = url.split('/');
      const last = parts[parts.length - 1];
      return decodeURIComponent(last).split('?')[0] || "Video Import";
    } catch {
      const parts = url.split('\\');
      return parts[parts.length - 1] || "Local Video Project";
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return "Just now";
    }
  };

  if (isInitialLoad && jobs.length === 0) return null;
  if (!isInitialLoad && jobs.length === 0) return null;

  return (
    <div className="mb-12 relative group/carousel">
      {/* Header section without top arrows */}
      <div className="flex items-center gap-3 mb-6">
        <h3 className="text-xl sm:text-2xl font-black text-white uppercase italic tracking-tighter">Video Projects Library</h3>
        <div className="w-16 h-px bg-gradient-to-r from-primary/40 to-transparent" />
      </div>

      {/* Slide Container and Arrow Overlays */}
      <div className="relative w-full">
        {/* Left sliding side-arrow overlay */}
        {showLeftArrow && (
          <button
            type="button"
            onClick={() => handleScroll('left')}
            className="absolute left-[-20px] group/btn top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full border border-white/10 bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.8)] transition-all duration-300 hover:scale-110 opacity-0 group-hover/carousel:opacity-100 group-hover/carousel:left-2 cursor-pointer pointer-events-auto"
            title="Slide Left"
          >
            <ChevronLeft size={24} className="transition-transform duration-300 group-hover/btn:-translate-x-1" />
          </button>
        )}

        {/* Right sliding side-arrow overlay */}
        {showRightArrow && (
          <button
            type="button"
            onClick={() => handleScroll('right')}
            className="absolute right-[-20px] group/btn top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full border border-white/10 bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.8)] transition-all duration-300 hover:scale-110 opacity-0 group-hover/carousel:opacity-100 group-hover/carousel:right-2 cursor-pointer pointer-events-auto"
            title="Slide Right"
          >
            <ChevronRight size={24} className="transition-transform duration-300 group-hover/btn:translate-x-1" />
          </button>
        )}

        {/* Horizontal scrollable row */}
        <div 
          ref={scrollContainerRef}
          className="flex overflow-x-auto gap-6 pb-6 pt-2 scrollbar-none snap-x snap-mandatory scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <AnimatePresence mode="popLayout">
            {jobs.map((job) => {
              const isTerminal = ['completed', 'failed', 'dead_letter', 'cancelled'].includes(job.status);
              const isFailed = ['failed', 'dead_letter'].includes(job.status);
              const isCancelled = job.status === 'cancelled';
              const isCompleted = job.status === 'completed';
              const name = getProjectName(job.video_url);

              return (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-[320px] sm:w-[360px] shrink-0 snap-start relative p-5 rounded-[24px] glass-card border-white/5 bg-white/[0.01] hover:border-primary/20 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-lg"
                >
                  <div>
                    {/* Visual Header */}
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-950 to-slate-900 border border-white/5 flex flex-col items-center justify-center relative overflow-hidden shrink-0 shadow-inner">
                        {isCompleted ? (
                          <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                            <CheckCircle2 size={16} />
                          </div>
                        ) : isFailed ? (
                          <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center text-red-400">
                            <AlertCircle size={16} />
                          </div>
                        ) : isCancelled ? (
                          <div className="absolute inset-0 bg-white/5 flex items-center justify-center text-white/30">
                            <XCircle size={16} />
                          </div>
                        ) : (
                          <div className="absolute inset-0 bg-primary/10 flex items-center justify-center text-primary">
                            <Loader2 className="animate-spin" size={16} />
                          </div>
                        )}
                        <Film size={18} className="text-white/10" />
                      </div>

                      <div className="min-w-0 flex-grow space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em]">
                            ID: {job.id.slice(0, 6)}
                          </span>
                          <div className={`px-2 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-widest ${
                            isCompleted ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                            isFailed ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                            isCancelled ? 'bg-white/5 border-white/10 text-white/40' :
                            'bg-primary/10 border-primary/20 text-primary'
                          }`}>
                            {job.status}
                          </div>
                        </div>

                        <h4 className="text-xs font-bold text-white tracking-tight truncate uppercase italic group-hover:text-primary transition-colors">
                          {name}
                        </h4>

                        <div className="flex items-center gap-1 text-[8px] font-bold text-white/35 uppercase tracking-widest">
                          <Calendar size={8} />
                          {formatDate(job.created_at)}
                        </div>
                      </div>
                    </div>

                    {/* Progress segment if active */}
                    {!isTerminal && (
                      <div className="mb-4">
                        <div className="flex justify-between text-[8px] font-bold text-white/20 uppercase tracking-widest mb-1.5">
                          <span>Clipping Progress</span>
                          <span>{Math.round(job.progress)}%</span>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-primary shadow-[0_0_10px_rgba(200,119,64,0.5)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${job.progress}%` }}
                            transition={{ type: "spring", bounce: 0, duration: 1 }}
                          />
                        </div>
                      </div>
                    )}

                    {isCompleted && (
                      <div className="mb-3 text-[9px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 size={10} /> {job.payload?.numClips || 3} Clips Generated
                      </div>
                    )}

                    {isFailed && (
                      <div className="mb-3 text-[8px] font-semibold text-red-400 truncate leading-relaxed">
                        Error: {job.failed_reason || "Video analysis failed"}
                      </div>
                    )}
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center gap-2 border-t border-white/5 pt-3 mt-auto">
                    {!isTerminal ? (
                      <button
                        type="button"
                        disabled={actionLoadingId !== null}
                        onClick={(e) => handleCancel(job.id, e)}
                        className="flex-1 py-1.5 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 text-red-400 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {actionLoadingId === `${job.id}-cancel` ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <XCircle size={10} />
                        )}
                        Cancel
                      </button>
                    ) : (
                      <>
                        {(isFailed || isCancelled) && (
                          <button
                            type="button"
                            disabled={actionLoadingId !== null}
                            onClick={(e) => handleRetry(job.id, e)}
                            className="flex-1 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/20 text-indigo-400 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                          >
                            {actionLoadingId === `${job.id}-retry` ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : (
                              <RotateCcw size={10} />
                            )}
                            Retry
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={actionLoadingId !== null}
                          onClick={(e) => handleRestart(job.id, e)}
                          className="flex-grow py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white rounded-lg text-[8px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {actionLoadingId === `${job.id}-restart` ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <Play size={10} fill="currentColor" />
                          )}
                          Restart Project
                        </button>
                      </>
                    )}
                  </div>

                  {/* Ambient glow decoration */}
                  <div className="absolute top-0 right-0 -mr-12 -mt-12 w-20 h-24 bg-primary/5 blur-2xl rounded-full pointer-events-none" />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
