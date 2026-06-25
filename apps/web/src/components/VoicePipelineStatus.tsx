"use client";

import React from 'react';
import { Activity, CheckCircle2, Circle, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const STAGES = [
  { id: 'V0', label: 'Source Acquisition' },
  { id: 'V1', label: 'Clip Definition Engine' },
  { id: 'V2', label: 'Script Intelligence' },
  { id: 'V3', label: 'Voice Synthesis' },
  { id: 'V4', label: 'Audio Processing' },
  { id: 'V5', label: 'Clip Muting' },
  { id: 'V6', label: 'Voice Alignment' },
  { id: 'V7', label: 'Final Render' },
  { id: 'V8', label: 'Quality Validation' },
  { id: 'V9', label: 'Persistence' },
  { id: 'V10', label: 'Production Audit' },
];

interface Props {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  currentStage: string | null;
  progress: number;
  error?: string | null;
}

export const VoicePipelineStatus: React.FC<Props> = ({ status, currentStage, progress, error }) => {
  const currentIndex = STAGES.findIndex(s => s.id === currentStage);

  return (
    <div className="flex flex-col h-full bg-[#030712] rounded-3xl border border-white/10 overflow-hidden relative">
      <div className="p-6 border-b border-white/5 flex items-center justify-between z-10 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
            <Activity size={20} />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg tracking-tight">Pipeline Status</h2>
            <div className="flex items-center gap-2">
              <p className="text-white/40 text-[11px] font-medium tracking-wider uppercase">V0-V10 Execution</p>
              {status === 'processing' && (
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full animate-pulse">
                  {progress}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 relative z-10 custom-scrollbar">
        {status === 'idle' ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
            <Activity size={32} className="mb-3 opacity-20" />
            <p className="text-sm font-bold text-white/40 uppercase tracking-widest">Waiting to render</p>
          </div>
        ) : (
          <div className="space-y-4">
            {STAGES.map((stage, idx) => {
              const isPast = currentIndex > idx || status === 'completed';
              const isCurrent = currentIndex === idx && status === 'processing';
              const isFailed = currentStage === stage.id && status === 'failed';

              let Icon = Circle;
              let colorClass = 'text-white/10';
              let bgClass = 'bg-transparent border-transparent';

              if (isPast) {
                Icon = CheckCircle2;
                colorClass = 'text-emerald-400';
              } else if (isCurrent) {
                Icon = Loader2;
                colorClass = 'text-emerald-400 animate-spin';
                bgClass = 'bg-emerald-500/5 border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]';
              } else if (isFailed) {
                Icon = AlertCircle;
                colorClass = 'text-red-400';
                bgClass = 'bg-red-500/5 border-red-500/20';
              }

              return (
                <motion.div
                  key={stage.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`flex items-center gap-4 p-3 rounded-xl border transition-all ${bgClass}`}
                >
                  <Icon size={18} className={colorClass} />
                  <div className="flex-1">
                    <div className={`text-sm font-bold ${isPast || isCurrent ? 'text-white' : 'text-white/40'}`}>
                      {stage.id} — {stage.label}
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {error && (
              <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-xs font-mono text-red-400">{error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
