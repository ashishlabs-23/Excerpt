"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { useWorkerLive } from "@/lib/useDashboard";

function formatUptime(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

const WORKER_META: Record<string, { color: string; desc: string }> = {
  VideoWorker: {
    color: "text-primary",
    desc: "Analysis · Transcription · Intelligence scoring · Crop planning",
  },
  RenderWorker: {
    color: "text-amber-400",
    desc: "FFmpeg manipulation · Clip assembly · Caption burn",
  },
  VoiceoverWorker: {
    color: "text-emerald-400",
    desc: "TTS generation · Audio replacement · Voiceover gallery",
  },
};


// Self-contained: polls /api/system/live every 5s independently of the parent dashboard
export function WorkerHeartbeatPanel() {
  const { data, loading, error } = useWorkerLive();
  const workers = data?.workers ?? { healthy: false, workers: [] };
  const activeJobCount = data?.activeJobCount ?? 0;

  if (loading && !data) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 rounded-[28px] glass-card border-white/5 flex items-center justify-center h-48"
      >
        <div className="flex items-center gap-3 text-white/30">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Connecting to workers…</span>
        </div>
      </motion.div>
    );
  }

  const workerList = workers.workers ?? [];
  const allHealthy = workers.healthy;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="p-6 sm:p-8 rounded-[28px] glass-card border-white/5 hover:border-white/10 transition-all duration-500 relative overflow-hidden"
    >
      {/* BG glow */}
      <div
        className={`absolute -top-10 -right-10 w-48 h-48 rounded-full blur-[80px] pointer-events-none opacity-10 ${
          allHealthy ? "bg-emerald-500" : "bg-rose-500"
        }`}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">
              Worker Heartbeats · 5s
            </p>
            <h2 className="text-xl font-black text-white uppercase tracking-tight">
              Pipeline Workers
            </h2>
          </div>
          <div className="flex items-center gap-4">
            {activeJobCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">
                  {activeJobCount} active
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  allHealthy ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">
                {allHealthy ? "All Systems Nominal" : "Degraded"}
              </span>
            </div>
          </div>
        </div>

        {/* Worker cards */}
        <div className="space-y-4">
          <AnimatePresence>
            {workerList.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5"
              >
                <Activity size={16} className="text-white/30 animate-pulse" />
                <p className="text-white/30 text-sm">Waiting for worker registry…</p>
              </motion.div>
            ) : (
              workerList.map((worker, i) => {
                const meta = WORKER_META[worker.name] ?? {
                  color: "text-white/60",
                  desc: "Pipeline worker",
                };
                const status = worker.stopped
                  ? "crash-loop"
                  : worker.running
                  ? "running"
                  : "stopped";

                return (
                  <motion.div
                    key={worker.name}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className={`p-5 rounded-2xl border transition-all ${
                      status === "running"
                        ? "border-white/[0.06] bg-black/20 hover:border-white/10"
                        : status === "crash-loop"
                        ? "border-rose-500/20 bg-rose-500/[0.04]"
                        : "border-amber-500/20 bg-amber-500/[0.04]"
                    }`}
                  >
                    {/* Worker header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center ${meta.color}`}
                        >
                          <Cpu size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-white">
                            {worker.name}
                          </p>
                          <p className="text-[9px] text-white/30 mt-0.5">
                            {meta.desc}
                          </p>
                        </div>
                      </div>

                      {/* Status badge */}
                      {status === "running" ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                          <CheckCircle2 size={10} className="text-emerald-400" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                            Healthy
                          </span>
                        </div>
                      ) : status === "crash-loop" ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20">
                          <XCircle size={10} className="text-rose-400" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-rose-400">
                            Crash Loop
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                          <AlertTriangle size={10} className="text-amber-400" />
                          <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">
                            Stopped
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center">
                          <Activity size={10} className="text-white/40" />
                        </div>
                        <div>
                          <p className="text-[8px] text-white/30 uppercase tracking-widest">
                            PID
                          </p>
                          <p className="text-xs font-bold text-white">
                            {worker.pid ?? "—"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center">
                          <Clock size={10} className="text-white/40" />
                        </div>
                        <div>
                          <p className="text-[8px] text-white/30 uppercase tracking-widest">
                            Uptime
                          </p>
                          <p className="text-xs font-bold text-white">
                            {formatUptime(worker.uptimeSeconds)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center">
                          <RotateCcw size={10} className="text-white/40" />
                        </div>
                        <div>
                          <p className="text-[8px] text-white/30 uppercase tracking-widest">
                            Restarts
                          </p>
                          <p
                            className={`text-xs font-bold ${
                              worker.restarts > 3
                                ? "text-rose-400"
                                : worker.restarts > 0
                                ? "text-amber-400"
                                : "text-white"
                            }`}
                          >
                            {worker.restarts}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>

        {workers.error && (
          <div className="mt-4 flex items-center gap-2 text-rose-400/60 text-xs">
            <AlertTriangle size={12} />
            <span>{workers.error}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};
