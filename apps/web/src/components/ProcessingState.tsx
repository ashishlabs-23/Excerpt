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
                      ) : isActive && !error ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Icon size={16} />
                      )}

                      {isActive && !error && (
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

          {/* Right Panel: Large SVG Loader and Diagnostic Box */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 rounded-2xl bg-white/[0.01] border border-white/5 h-full min-h-[340px]">
            {/* SVG Circular Loader */}
            <div className="relative w-44 h-44 mb-6">
              <svg className="w-full h-full transform -rotate-90">
                {/* Background circle */}
                <circle 
                  cx="88" 
                  cy="88" 
                  r="74" 
                  stroke="currentColor" 
                  strokeWidth="8" 
                  fill="transparent" 
                  className="text-white/5" 
                />
                {/* Progress circle */}
                <motion.circle 
                  cx="88" 
                  cy="88" 
                  r="74" 
                  stroke="currentColor" 
                  strokeWidth="8" 
                  fill="transparent" 
                  className={cn(
                    error ? "text-red-500" : "text-primary"
                  )}
                  strokeDasharray="465"
                  animate={{ strokeDashoffset: 465 - (465 * progress) / 100 }}
                  transition={{ ease: "easeOut", duration: 0.8 }}
                />
              </svg>
              {/* Central Text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-white italic tracking-tighter">
                  {progress}%
                </span>
                <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.25em] mt-1">
                  Overall Completion
                </span>
              </div>
            </div>

            {/* Stage description text */}
            <div className="text-center mb-6">
              <span className="text-[9px] font-black text-white/30 uppercase tracking-widest block mb-1">
                Current Operation
              </span>
              <p className={cn(
                "text-xs font-bold uppercase italic tracking-tight",
                error ? "text-red-400" : "text-white"
              )}>
                {error ? "Pipeline Terminated" : (stageLabel || activeStep.desc)}
              </p>
            </div>

            {/* Diagnostic Alert Box */}
            <AnimatePresence>
              {error && (
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
                        Download Blocked
                      </h4>
                      <p className="text-[10px] text-red-200/60 leading-normal font-semibold italic">
                        {error}
                        <strong className="text-red-400 block mt-1">
                          Tip: Drag and drop a local file to bypass third-party rate limits.
                        </strong>
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
