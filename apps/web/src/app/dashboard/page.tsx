"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SidebarNav } from "@/components/SidebarNav";
import { DashboardMetrics } from "@/components/DashboardMetrics";
import { QualityDashboard } from "@/components/QualityDashboard";
import { UploadZone } from "@/components/UploadZone";
import { Zap, Shield, ChevronRight, CheckCircle2, Cpu } from "lucide-react";
import { ProcessingState } from "@/components/ProcessingState";
import { RecentClips } from "@/components/RecentClips";
import { ActiveJobs } from "@/components/ActiveJobs";
import { HowItWorksModal } from "@/components/HowItWorksModal";
import { authFetch } from "@/lib/api";
import { useRealtimeSync } from "@/lib/useRealtimeSync";
import { AuthGate } from "@/components/AuthGate";
import { useDashboard } from "@/lib/useDashboard";
import { PipelineHealthMonitor } from "@/components/PipelineHealthMonitor";
import { RetryTelemetryCard } from "@/components/RetryTelemetryCard";
import { SystemAlerts } from "@/components/SystemAlerts";
import { QueuePressureCard } from "@/components/QueuePressureCard";
import { DeploymentMetadataCard } from "@/components/DeploymentMetadataCard";
import { TrendChartsCard } from "@/components/TrendChartsCard";

const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "dead_letter", "cancelled"]);

function isTerminalJobStatus(status?: string) {
  return Boolean(status && TERMINAL_JOB_STATUSES.has(status));
}

export default function DashboardPage() {
  const { data: dashboardData, loading: dashLoading } = useDashboard();
  const [activeJobFailed, setActiveJobFailed] = useState(false);
  const userClickedCompletedJob = useRef(false);
  const [activeJob, setActiveJob] = useState<any>(null);
  const [lastJobId, setLastJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [importUrl, setImportUrl] = useState<string | undefined>(undefined);
  // Controls whether the processing overlay is visible on top of UploadZone
  const [showProcessingOverlay, setShowProcessingOverlay] = useState(false);

  useEffect(() => {
    const storedJobId = localStorage.getItem("lastJobId");
    if (storedJobId) {
      setLastJobId(storedJobId);
      const minimized = localStorage.getItem(`minimizeOverlay_${storedJobId}`) === "true";
      if (!minimized) {
        setShowProcessingOverlay(true);
      }
      setIsLoading(false);
    } else {
      // Auto-detect any running job even if not started from this browser
      authFetch('/api/video/jobs')
        .then(r => r.json())
        .then((jobs: any[]) => {
          const activeJob = jobs?.find(j => !TERMINAL_JOB_STATUSES.has(j.status));
          if (activeJob) {
            console.log('[Dashboard]: Auto-detected active job:', activeJob.id);
            localStorage.setItem('lastJobId', activeJob.id);
            setLastJobId(activeJob.id);
            const minimized = localStorage.getItem(`minimizeOverlay_${activeJob.id}`) === "true";
            if (!minimized) {
              setShowProcessingOverlay(true);
            }
          }
        })
        .catch(() => {})
        .finally(() => setIsLoading(false));
    }

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlParam = params.get("import_url");
      if (urlParam) {
        setImportUrl(urlParam);
      }
    }
  }, []);

  const consecutive404s = React.useRef(0);
  const activeGenerationMode = activeJob?.generationMode || (activeJob?.recoveryMode ? "recovery" : "ai");
  const activeJobFailed = activeJob?.status === "failed" || activeJob?.status === "dead_letter" || activeJob?.status === "cancelled";
  
  useEffect(() => {
    if (!lastJobId) return;

    let timeoutId: NodeJS.Timeout;
    let baseDelay = 3000;

    const pollStatus = async () => {
      try {
        const response = await authFetch(`/api/video/status/${lastJobId}`);
        const data = await response.json();
        
        console.log(`[Dashboard]: Job status update for ${lastJobId}:`, data);

        if (!response.ok || data.error) {
          if (response.status === 404) {
            consecutive404s.current += 1;
            console.warn(`[Dashboard]: Job not found (Trial ${consecutive404s.current}/10)`);
            
            if (consecutive404s.current > 10) {
              localStorage.removeItem("lastJobId");
              setLastJobId(null);
              setActiveJob(null);
              setShowProcessingOverlay(false);
              return;
            }
          }
          // Exponential backoff
          const delay = Math.min(baseDelay * Math.pow(1.5, consecutive404s.current), 15000);
          timeoutId = setTimeout(pollStatus, delay);
          return;
        }

        // Reset failure counter and backoff on success
        consecutive404s.current = 0;
        baseDelay = 3000;
        
        if (data.status === "completed") {
          console.log("[Dashboard]: Job completed successfully. Validating result fields...");
          if (data.result && Array.isArray(data.result) && data.result.length > 0) {
            const firstClip = data.result[0];
            const requiredFields = [
              { key: "video_file", valid: Boolean(firstClip.video_file) },
              { key: "thumbnail", valid: Boolean(firstClip.thumbnail || firstClip.thumbnail_file) },
              { key: "title", valid: Boolean(firstClip.title) },
              { key: "caption", valid: Boolean(firstClip.caption) },
            ];
            const missing = requiredFields.filter((field) => !field.valid).map((field) => field.key);
            
            if (missing.length === 0) {
              console.log("[Dashboard]: All Gen-3 fields verified:", {
                video: firstClip.video_file,
                thumbnail: firstClip.thumbnail || firstClip.thumbnail_file,
                title: firstClip.title,
                caption: firstClip.caption?.slice(0, 30) + "..."
              });
            } else {
              console.warn("[Dashboard]: Missing fields in result schema:", missing, firstClip);
            }
          }
          setActiveJob(data);
          setLastJobId(null); // Stop polling
          localStorage.removeItem("lastJobId");
          localStorage.removeItem(`minimizeOverlay_${lastJobId}`);
          if (!userClickedCompletedJob.current) {
            setTimeout(() => setShowProcessingOverlay(false), 1500);
          }
          userClickedCompletedJob.current = false;
        } else if (data.status === "failed" || data.status === "dead_letter") {
          console.error("[Dashboard]: Job execution failed:", data.failedReason);
          setActiveJob(data);
          setLastJobId(null);
          localStorage.removeItem("lastJobId");
          localStorage.removeItem(`minimizeOverlay_${lastJobId}`);
        } else {
          setActiveJob(data);
          timeoutId = setTimeout(pollStatus, baseDelay);
        }
      } catch (error) {
        console.error("[Dashboard]: Polling failed:", error);
        consecutive404s.current += 1;
        const delay = Math.min(baseDelay * Math.pow(1.5, consecutive404s.current), 15000);
        timeoutId = setTimeout(pollStatus, delay);
      }
    };

    pollStatus();

    return () => clearTimeout(timeoutId);
  }, [lastJobId]);

  const hydrateTerminalStatus = async (targetJobId: string) => {
    try {
      const response = await authFetch(`/api/video/status/${targetJobId}`, {
      });
      const data = await response.json();
      if (response.ok && !data.error) {
        setActiveJob(data);
      }
    } catch (error) {
      console.error("[Dashboard]: Final status hydration failed:", error);
    } finally {
      setLastJobId(null);
      localStorage.removeItem("lastJobId");
      localStorage.removeItem(`minimizeOverlay_${targetJobId}`);
    }
  };

  useRealtimeSync(lastJobId, (row) => {
    setActiveJob((previous: any) => ({
      ...(previous || {}),
      ...row,
      id: row.id || lastJobId,
    }));

    if (isTerminalJobStatus(row.status)) {
      hydrateTerminalStatus(row.id || lastJobId!);
    }
  });

  return (
    <AuthGate>
  {isLoading ? (
      <div className="flex h-screen bg-[#030712] items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-50" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6 relative z-10"
        >
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="w-16 h-16 rounded-full border-2 border-primary/20 border-t-primary shadow-[0_0_20px_rgba(99,102,241,0.3)]"
            />
            <Zap className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
          </div>
          <div className="text-center">
            <h2 className="text-white font-black tracking-[0.3em] uppercase text-[10px] mb-2 italic">Loading Workspace</h2>
            <p className="text-white/20 text-[8px] font-bold uppercase tracking-widest animate-pulse">Preparing your environment...</p>
          </div>
        </motion.div>
      </div>
  ) : (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-screen bg-[#030712] text-[#e0e5f6] relative overflow-hidden"
    >
      {/* Cyber-Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      <SidebarNav />

      <main className="flex-grow overflow-y-auto px-4 sm:px-6 lg:px-10 pt-8 lg:pt-12 pb-32 lg:pb-12 relative z-10">
        <div className="max-w-7xl mx-auto">
          {/* Elite Header Interface */}
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-center justify-between mb-16 gap-6"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                 <div className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] font-black text-white/40 tracking-[0.3em] uppercase">Control Center</div>
                 <ChevronRight size={12} className="text-white/20" />
                 <span className="text-[10px] font-black text-primary tracking-[0.2em] uppercase italic">Gen-3 Core</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <h1 className="text-3xl sm:text-5xl font-black tracking-tighter text-white uppercase italic">
                  CLIP
                </h1>
                <div className="h-px w-16 sm:w-px sm:h-10 bg-white/10 sm:mx-2 rotate-0 sm:rotate-12" />
                <h2 className="text-3xl sm:text-5xl font-black tracking-tighter text-primary uppercase italic opacity-80">
                  WORKSPACE
                </h2>
              </div>
              <p className="text-white/30 text-xs font-medium uppercase tracking-[0.2em] max-w-md leading-relaxed">
                {activeJob && (activeJob.status === 'processing' || activeJob.status === 'transcribing')
                  ? `ACTIVE: PROCESSING CLIP #${activeJob.id.slice(0, 8)}`
                  : "SYSTEM READY // CONNECTED"}
              </p>
            </div>

            <div className="flex w-full md:w-auto items-center justify-between md:justify-end gap-4 sm:gap-6">
               <div className="text-left md:text-right flex flex-col items-start md:items-end">
                  <div className="flex items-center gap-2 text-white font-black italic tracking-tight text-sm">
                     <Shield size={14} className="text-emerald-400" />
                     SECURE CONNECTION
                  </div>
                  <span className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] mt-1">Status: Active</span>
               </div>
               
               <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl glass-card border-white/10 flex items-center justify-center group cursor-pointer hover:border-primary/40 transition-all">
                  <div className="text-xl font-black text-primary group-hover:scale-110 transition-transform">A</div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#030712] border border-white/10 flex items-center justify-center">
                     <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
               </div>
            </div>
          </motion.header>
          
          {/* Active Minimized Job Banner */}
          {activeJob && !TERMINAL_JOB_STATUSES.has(activeJob.status) && !showProcessingOverlay && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-4 sm:p-5 glass-card border-primary/30 bg-primary/[0.02] rounded-3xl relative overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-4 cursor-pointer hover:border-primary/50 transition-all shadow-[0_0_30px_rgba(200,119,64,0.1)]"
              onClick={() => {
                localStorage.removeItem(`minimizeOverlay_${activeJob.id}`);
                setShowProcessingOverlay(true);
              }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary shadow-[0_0_20px_rgba(200,119,64,0.2)] border border-primary/20 animate-pulse">
                  <Cpu size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase italic tracking-tight mb-0.5">
                    Job running in background ({Math.round(activeJob.progress ?? 0)}%)
                  </h3>
                  <p className="text-primary/60 text-[9px] font-bold uppercase tracking-[0.2em]">
                    Status: {activeJob.status} • Click here to restore full progress overlay
                  </p>
                </div>
              </div>
              <button 
                className="px-5 py-2.5 rounded-xl bg-primary text-white text-[9px] font-black uppercase tracking-widest hover:bg-primary/80 shadow-lg shadow-primary/20 transition-all relative z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  localStorage.removeItem(`minimizeOverlay_${activeJob.id}`);
                  setShowProcessingOverlay(true);
                }}
              >
                Restore View
              </button>
            </motion.div>
          )}

          {/* UploadZone — always visible, never blurred */}
          <motion.section
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: "circOut" }}
            className="mb-12 relative"
          >
            <UploadZone
              initialUrl={importUrl}
              onUploadComplete={(jobId) => {
                localStorage.setItem("lastJobId", jobId);
                localStorage.removeItem(`minimizeOverlay_${jobId}`);
                setLastJobId(jobId);
                setActiveJob({ status: 'initiating', progress: 0, id: jobId });
                consecutive404s.current = 0;
                setShowProcessingOverlay(true);
              }}
            />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-10"
          >
            <div className="rounded-[28px] sm:rounded-[32px] border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-5 sm:p-7 relative overflow-hidden w-full">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,0.16),transparent_35%)]" />
              <div className="relative z-10">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/35 mb-2">
                      Tools & Controls
                    </p>
                    <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight italic uppercase">
                      Workspace Studio
                    </h2>
                  </div>
                  <div className="flex gap-2">
                    <div className="px-4 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-[0.25em]">
                      {activeJob ? activeJob.status : "Operational"}
                    </div>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="rounded-2xl border border-white/8 bg-black/40 p-5 group hover:border-primary/30 transition-all">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
                       <Zap size={16} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/30 mb-2">
                      Queue status
                    </p>
                    <p className="text-white font-bold tracking-tight">
                      {activeJob ? `JOB-${activeJob.id?.slice(0, 6)}` : "READY"}
                    </p>
                  </div>
                  
                  <div className="rounded-2xl border border-white/8 bg-black/40 p-5 group hover:border-primary/30 transition-all">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
                       <CheckCircle2 size={16} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/30 mb-2">
                      Integrity Mode
                    </p>
                    <p className="text-white font-bold tracking-tight">
                      {activeGenerationMode?.toUpperCase() || "AI-NATIVE"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-black/40 p-5 group hover:border-primary/30 transition-all">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/40 mb-4 group-hover:scale-110 transition-transform">
                       <Shield size={16} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/30 mb-2">
                      Secure Origin
                    </p>
                    <p className="text-white font-bold tracking-tight uppercase">
                       Verified Links
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          <DashboardMetrics />

          {/* ═══════════════════════════════════════════════════════
              SYSTEM ALERTS — top of ops zone, 10s poll
             ═══════════════════════════════════════════════════════ */}
          <SystemAlerts />

          {/* ═══════════════════════════════════════════════════════
              QUEUE PRESSURE — self-polls 10s, shows pipeline depth
             ═══════════════════════════════════════════════════════ */}
          <QueuePressureCard />



          {/* ═══════════════════════════════════════════════════════
              PIPELINE HEALTH — centrepiece of operations dashboard
             ═══════════════════════════════════════════════════════ */}
          {!dashLoading && dashboardData && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <PipelineHealthMonitor pipeline={dashboardData.pipeline} />
            </motion.section>
          )}

          {/* Deployment Metadata */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-12 mt-8"
          >
            <DeploymentMetadataCard />
          </motion.section>

          {/* Trend Charts */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mb-12 mt-8"
          >
            <TrendChartsCard />
          </motion.section>

          {/* Success Notification - Cyber Style */}
          <AnimatePresence>
            {activeJob && activeJob.status === "completed" && !showProcessingOverlay && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="mb-12 p-8 glass-card border-emerald-500/30 bg-emerald-500/[0.02] rounded-[32px] relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />
                <div className="flex items-center gap-6 relative z-10">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)] border border-emerald-500/20">
                    <CheckCircle2 size={32} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase italic tracking-tight mb-1">Processing Complete</h3>
                    <p className="text-emerald-400/60 text-[10px] font-bold uppercase tracking-[0.2em]">
                      {activeGenerationMode === "heuristic"
                        ? "Transcript-guided clips have been rendered and added to your gallery."
                        : activeJob.recoveryMode
                           ? "Draft clips have been rendered and added to your gallery."
                           : "All video clips are now available in your gallery."}
                    </p>
                  </div>
                  <button 
                    onClick={() => setActiveJob(null)}
                    className="ml-auto px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Dismiss Link
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* System Interlocks (Upload & Results) */}
          <div className="space-y-20">
            <motion.section
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <ActiveJobs onJobSelect={(job) => {
                const jobId = job.id;
                localStorage.setItem("lastJobId", jobId);
                localStorage.removeItem(`minimizeOverlay_${jobId}`);
                setLastJobId(jobId);
                
                if (job.status === 'completed') {
                  userClickedCompletedJob.current = true;
                  setActiveJob(job);
                } else {
                  userClickedCompletedJob.current = false;
                  setActiveJob(job);
                }
                
                consecutive404s.current = 0;
                setShowProcessingOverlay(true);
              }} />
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <RecentClips clips={activeJob?.result} />
            </motion.section>
          </div>



          <QualityDashboard />
        </div>
      </main>

      {/* ═══════════════════════════════════════════════════════════════
          PROCESSING OVERLAY — slides in from top over the UploadZone
          when Generate Clips is clicked, dismisses on completion/error
         ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showProcessingOverlay && activeJob && activeJob.status !== "completed" && (
          <motion.div
            key="processing-overlay"
            initial={{ opacity: 0, y: "-100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "-100%" }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 left-0 lg:left-72 z-50 flex flex-col pointer-events-none"
          >
            {/* Blurred backdrop so the dashboard beneath is still visible but de-emphasised */}
            <div className="absolute inset-0 bg-[#030712]/85 backdrop-blur-md" />

            {/* Centered processing card */}
            <div className="relative z-10 flex-1 flex flex-col justify-center px-4 sm:px-8 lg:px-16 pointer-events-auto">
              {/* Dismiss button for error state */}
              {activeJobFailed ? (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  onClick={() => {
                    setShowProcessingOverlay(false);
                    setActiveJob(null);
                  }}
                  className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  ✕ Dismiss
                </motion.button>
              ) : (
                <button
                  onClick={() => {
                    localStorage.setItem(`minimizeOverlay_${activeJob.id}`, "true");
                    setShowProcessingOverlay(false);
                  }}
                  className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all z-20 cursor-pointer"
                >
                  ✕ Minimize to Background
                </button>
              )}

              <div className="max-w-5xl mx-auto w-full">
                <ProcessingState
                  status={activeJob.status}
                  progress={activeJob.progress ?? 0}
                  error={activeJobFailed ? (activeJob.error || activeJob.failedReason || 'Job Interrupted') : undefined}
                  stageLabel={activeJob.stage_label}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <HowItWorksModal 
        isOpen={isHowItWorksOpen} 
        onClose={() => setIsHowItWorksOpen(false)} 
      />
    </motion.div>
  )}
    </AuthGate>
  );
}
