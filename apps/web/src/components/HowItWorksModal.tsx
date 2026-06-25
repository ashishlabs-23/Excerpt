"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Cpu, Shield, Globe, Terminal } from "lucide-react";

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HowItWorksModal({ isOpen, onClose }: HowItWorksModalProps) {
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-2xl"
          >
            <div className="absolute inset-0 bg-primary/[0.02] pointer-events-none" />
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="my-auto w-full max-w-2xl max-h-[calc(100svh-2rem)] glass-card bg-[#0b1220]/90 border-white/10 rounded-[28px] sm:rounded-[32px] overflow-hidden relative z-10 p-5 sm:p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)]"
          >
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-white/5 border border-white/10 text-white/40 hover:text-white transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-6 sm:mb-8 pr-12">
              <div className="flex items-center gap-3 mb-2">
                 <div className="px-2 py-0.5 rounded bg-primary/20 border border-primary/30 text-[8px] font-black text-primary tracking-[0.3em] uppercase">Knowledge Base</div>
                  <span className="text-[10px] font-black text-white/20 tracking-[0.2em] uppercase italic">Version 3.0</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white italic uppercase tracking-tighter">How It Works</h2>
            </div>

            <div className="space-y-6 max-h-[calc(100svh-12rem)] overflow-y-auto pr-2 sm:pr-4 custom-scrollbar">
              <section className="space-y-3">
                <div className="flex items-center gap-3 text-primary">
                  <Cpu size={18} />
                  <h3 className="font-bold uppercase tracking-widest text-sm">The Pipeline</h3>
                </div>
                <p className="text-xs text-white/50 leading-relaxed">
                  Excerpt uses an AI processing pipeline to isolate viral moments. First, we analyze audio signals for "hooks" and emotional spikes. Next, our visual engine tracks speakers to ensure perfect 9:16 vertical composition.
                </p>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div className="flex items-center gap-2 mb-2 text-emerald-400">
                    <Zap size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">AI-Native Mode</span>
                  </div>
                  <p className="text-[10px] text-white/40 leading-relaxed">
                    Default high-fidelity processing. Uses LLM-driven intelligence to detect context and narratively coherent clips.
                  </p>
                </div>
                
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                  <div className="flex items-center gap-2 mb-2 text-primary">
                    <Shield size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Integrity Fallback</span>
                  </div>
                  <p className="text-[10px] text-white/40 leading-relaxed">
                    If AI services are throttled, our heuristic "Smart Mode" takes over, using transcript anchoring to ensure zero-failure delivery.
                  </p>
                </div>
              </div>

              <section className="space-y-3">
                <div className="flex items-center gap-3 text-amber-400">
                  <Globe size={18} />
                  <h3 className="font-bold uppercase tracking-widest text-sm">Supported Media</h3>
                </div>
                <ul className="text-xs text-white/50 space-y-2 list-none p-0">
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-amber-400" />
                    YouTube URLs: Direct processing via secure import.
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-amber-400" />
                    Local Files: MP4, MOV, and high-bitrate containers supported.
                  </li>
                </ul>
              </section>

              <section className="space-y-3 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-3 text-primary">
                  <Terminal size={18} />
                  <h3 className="font-bold uppercase tracking-widest text-sm">Pro Tip: Recommended Flow</h3>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">
                  Start with 2-3 clips for the fastest turnaround. Once the source data is verified, you can scale to full batch processing for maximum coverage.
                </p>
              </section>
            </div>

            <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-white/5 flex justify-end">
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-8 py-3 rounded-xl bg-primary text-[#030712] text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(200,119,64,0.3)] hover:scale-105 transition-all"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
