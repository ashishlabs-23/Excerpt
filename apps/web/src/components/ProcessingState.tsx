/** @jsxImportSource react */
"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, 
  Download, 
  Scissors, 
  Sparkles, 
  CheckCircle2, 
  Cpu, 
  Zap, 
  Activity,
  AlertTriangle,
  Film,
  Camera
} from 'lucide-react';
import { cn } from "@/lib/utils";

interface ProcessingStateProps {
  status: string;
  progress: number;
  error?: string;
  stageLabel?: string;
}

export const ProcessingState: React.FC<ProcessingStateProps> = ({ status, progress, error, stageLabel }) => {
  const steps = [
    { key: 'initiating', label: 'Initialization', desc: 'Preparing scratch workspace and resources', icon: Loader2 },
    { key: 'processing', label: 'Media Download', desc: 'Acquiring video streams securely', icon: Download },
    { key: 'transcribing', label: 'Transcription', desc: 'Generating word-level speech tags (Whisper AI)', icon: Cpu },
    { key: 'detecting_clips', label: 'AI Story & Hook Analytics', desc: 'Detecting narrative hooks and viral peaks', icon: Sparkles },
    { key: 'cutting', label: 'Cinematic Clipping', desc: 'Extracting video frames and applying cropping plans', icon: Scissors },
    { key: 'captioning', label: 'Neural Captions Render', desc: 'Compiling karaoke ASS subtitle overlays', icon: Zap },
    { key: 'thumbnail', label: 'Peak Emotion Thumbnail', desc: 'Selecting highest-engagement cover frame', icon: Camera },
    { key: 'completed', label: 'Completed', desc: 'Clips ready in workspace library', icon: CheckCircle2 }
  ];

  // Normalise statuses that share a visual step with an existing key
  const normalizedStatus =
    status === 'queued' || status === 'retrying' ? 'initiating' :
    status === 'recovering' ? 'detecting_clips' :
    status;

  // Map backend status to step index
  let currentStepIndex = steps.findIndex(s => s.key === normalizedStatus);
  if (currentStepIndex === -1 && normalizedStatus !== 'failed') {
    if (progress < 10) currentStepIndex = 0;
    else if (progress < 25) currentStepIndex = 1;
    else if (progress < 50) currentStepIndex = 2;
    else if (progress < 70) currentStepIndex = 3;
    else if (progress < 85) currentStepIndex = 4;
    else if (progress < 95) currentStepIndex = 5;
    else currentStepIndex = 6;
  }

  if (normalizedStatus === 'failed' || normalizedStatus === 'dead_letter') {
    if (progress < 15) currentStepIndex = 1;
    else if (progress < 40) currentStepIndex = 2;
    else if (progress < 60) currentStepIndex = 3;
    else currentStepIndex = 4;
  }

  const activeStep = steps[currentStepIndex] || steps[0];
  const isTerminalFailed = normalizedStatus === 'failed' || normalizedStatus === 'dead_letter' || normalizedStatus === 'cancelled';
  const displayError = isTerminalFailed ? error : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="mb-16 w-full relative"
    >
      <div className="relative overflow-hidden rounded-3xl bg-slate-950/20 backdrop-blur-2xl border border-white/5 p-6 sm:p-10 shadow-[0_0_80px_rgba(0,0,0,0.6)]">
        {/* Glow Effects */}
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Panel: Vertical Stages Timeline */}
          <div className="lg:col-span-7 space-y-6">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.35em] text-primary block mb-1">
                AI Pipeline Execution
              </span>
              <h2 className="text-2xl font-black text-white uppercase italic tracking-tight">
                Live Status Tracker
              </h2>
            </div>

            <div className="relative pl-6 space-y-6 border-l border-white/5">
              {steps.map((step, idx) => {
                const isActive = idx === currentStepIndex;
                const isPast = idx < currentStepIndex;
                const Icon = step.icon;

                return (
                  <div key={step.key} className="relative group/item">
                    {/* Circle Node indicator */}
                    <div className={cn(
                      "absolute -left-[37px] top-0 w-8 h-8 rounded-full flex items-center justify-center border transition-all duration-500",
                      isActive 
                        ? "bg-primary text-secondary border-primary shadow-[0_0_20px_rgba(200,119,64,0.4)]" 
                        : isPast 
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                          : "bg-black/40 text-white/20 border-white/5"
                    )}>
                      {isPast ? (
                        <CheckCircle2 size={16} />
                      ) : isActive && !displayError ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Icon size={16} />
                      )}

                      {isActive && !displayError && (
                        <span className="absolute -inset-1 border border-primary/20 rounded-full animate-ping pointer-events-none" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h4 className={cn(
                          "text-xs font-bold uppercase tracking-wider transition-colors",
                          isActive 
                            ? "text-primary" 
                            : isPast 
                              ? "text-emerald-400" 
                              : "text-white/30"
                        )}>
                          {step.label}
                        </h4>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[8px] font-black uppercase tracking-wider animate-pulse">
                            Active Stage
                          </span>
                        )}
                      </div>
                      <p className={cn(
                        "text-[10px] font-medium leading-relaxed transition-colors",
                        isActive ? "text-white/70" : isPast ? "text-white/40" : "text-white/10"
                      )}>
                        {isActive && stageLabel ? stageLabel : step.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Large SVG Loader, Horizontal Loading Bar, and Diagnostic Box */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-white/10 h-full min-h-[380px] relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute w-48 h-48 bg-primary/20 blur-[80px] rounded-full pointer-events-none" />

            {/* SVG Circular Loader */}
            <div className="relative w-48 h-48 mb-6 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90 drop-shadow-[0_0_20px_rgba(249,115,22,0.35)]" viewBox="0 0 176 176">
                <defs>
                  <linearGradient id="excerpt-progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="50%" stopColor="#fb923c" />
                    <stop offset="100%" stopColor="#facc15" />
                  </linearGradient>
                  <linearGradient id="excerpt-error-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#dc2626" />
                  </linearGradient>
                </defs>

                {/* Outer track */}
                <circle 
                  cx="88" 
                  cy="88" 
                  r="74" 
                  stroke="rgba(255, 255, 255, 0.08)" 
                  strokeWidth="10" 
                  fill="transparent" 
                />

                {/* Animated Progress circle (strokeDashoffset correctly animated) */}
                <motion.circle 
                  cx="88" 
                  cy="88" 
                  r="74" 
                  stroke={displayError ? "url(#excerpt-error-gradient)" : "url(#excerpt-progress-gradient)"} 
                  strokeWidth="10" 
                  strokeLinecap="round"
                  fill="transparent" 
                  strokeDasharray="465"
                  initial={{ strokeDashoffset: 465 }}
                  animate={{ strokeDashoffset: 465 - (465 * Math.max(3, Math.min(100, progress ?? 0))) / 100 }}
                  transition={{ ease: "easeOut", duration: 0.8 }}
                />
              </svg>

              {/* Pulsing rotating aura */}
              {!displayError && (
                <div 
                  className="absolute inset-2 rounded-full border border-primary/20 pointer-events-none" 
                  style={{ animation: 'spin 12s linear infinite' }} 
                />
              )}

              {/* Central Text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
                <span className="text-4xl font-black text-white italic tracking-tighter drop-shadow-md">
                  {Math.round(progress ?? 0)}%
                </span>
                <span className="text-[9px] font-black text-white/50 uppercase tracking-[0.25em] mt-1">
                  Overall Completion
                </span>
              </div>
            </div>

            {/* Stage description text */}
            <div className="text-center mb-4 w-full px-4">
              <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-1">
                Current Operation
              </span>
              <p className={cn(
                "text-xs sm:text-sm font-black uppercase italic tracking-tight line-clamp-2",
                displayError ? "text-red-400" : "text-white"
              )}>
                {displayError ? "Pipeline Terminated" : (stageLabel || activeStep.desc)}
              </p>
            </div>

            {/* Horizontal Loading Bar with Animated Shimmer */}
            <div className="w-full max-w-[280px] mb-4">
              <div className="flex justify-between items-center text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1.5 px-0.5">
                <span>Pipeline Progress</span>
                <span className="text-primary font-black">{Math.round(progress ?? 0)}%</span>
              </div>
              <div className="h-2.5 w-full bg-white/10 rounded-full overflow-hidden relative border border-white/10 p-[1px] shadow-inner">
                <motion.div 
                  className={cn(
                    "h-full rounded-full relative overflow-hidden",
                    displayError 
                      ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.7)]" 
                      : "bg-gradient-to-r from-orange-500 via-amber-400 to-yellow-300 shadow-[0_0_15px_rgba(249,115,22,0.7)]"
                  )}
                  initial={{ width: "0%" }}
                  animate={{ width: `${Math.max(4, Math.min(100, progress ?? 0))}%` }}
                  transition={{ ease: "easeOut", duration: 0.8 }}
                >
                  {/* High-speed animated shimmer beam */}
                  {!displayError && (
                    <motion.div 
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/70 to-transparent w-full"
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
                    />
                  )}
                </motion.div>
              </div>
            </div>

            {/* Diagnostic Alert Box */}
            <AnimatePresence>
              {displayError && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="w-full bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-left"
                >
                  <div className="flex gap-3 items-start">
                    <AlertTriangle size={18} className="text-red-400 shrink-0" />
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-red-400 mb-1">
                        {displayError.toLowerCase().includes('download') ? 'Download Blocked' : 'Pipeline Interrupted'}
                      </h4>
                      <p className="text-[10px] text-red-200/60 leading-normal font-semibold italic">
                        {displayError}
                        {displayError.toLowerCase().includes('download') && (
                          <strong className="text-red-400 block mt-1">
                            Tip: Drag and drop a local file to bypass third-party rate limits.
                          </strong>
                        )}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </motion.div>
  );
};
