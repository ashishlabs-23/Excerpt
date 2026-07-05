"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  List,
  Zap,
  Clock,
  TrendingUp,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { authFetch } from "@/lib/api";

interface QueuePressureData {
  version: number;
  generatedAt: string;
  pressureLevel: "low" | "normal" | "high" | "critical";
  counts: {
    queued: number;
    processing: number;
    rendering: number;
    uploading: number;
    completed: number;
    failed: number;
  };
  avgWaitMs: number | null;
  throughput: {
    completedLastHour: number;
    completedLast24h: number;
  };
  oldestQueuedAt: string | null;
}

const PRESSURE_CONFIG = {
  low: {
    label: "Low",
    bar: "bg-emerald-500",
    text: "text-emerald-400",
    badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    glow: "bg-emerald-500/5",
    pct: 10,
  },
  normal: {
    label: "Normal",
    bar: "bg-blue-500",
    text: "text-blue-400",
    badge: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    glow: "bg-blue-500/5",
    pct: 40,
  },
  high: {
    label: "High",
    bar: "bg-amber-500",
    text: "text-amber-400",
    badge: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    glow: "bg-amber-500/5",
    pct: 70,
  },
  critical: {
    label: "Critical",
    bar: "bg-rose-500",
    text: "text-rose-400",
    badge: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    glow: "bg-rose-500/5",
    pct: 100,
  },
} as const;

function fmtWait(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(0)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function QueuePressureCard() {
  const [data, setData] = useState<QueuePressureData | null>(null);
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);

  const fetch_ = useCallback(async () => {
    try {
      const res = await authFetch("/api/system/queue-pressure");
      if (!res.ok) return;
      const json = await res.json();
      if (isMounted.current) setData(json);
    } catch {} finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetch_();
    const iv = setInterval(fetch_, 10_000);
    return () => { isMounted.current = false; clearInterval(iv); };
  }, [fetch_]);

  if (loading && !data) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 rounded-[28px] glass-card border-white/5 flex items-center justify-center h-48"
      >
        <Loader2 size={16} className="animate-spin text-white/20" />
      </motion.div>
    );
  }

  if (!data) return null;

  const cfg = PRESSURE_CONFIG[data.pressureLevel] ?? PRESSURE_CONFIG.low;
  const counts = data.counts;
  const activeTotal = counts.queued + counts.processing + counts.rendering + counts.uploading;

  const tiles = [
    { label: "Queued",     value: counts.queued,     color: "text-blue-400",    dot: "bg-blue-400" },
    { label: "Processing", value: counts.processing, color: "text-amber-400",   dot: "bg-amber-400 animate-pulse" },
    { label: "Rendering",  value: counts.rendering,  color: "text-purple-400",  dot: "bg-purple-400" },
    { label: "Uploading",  value: counts.uploading,  color: "text-cyan-400",    dot: "bg-cyan-400" },
    { label: "Completed",  value: counts.completed,  color: "text-emerald-400", dot: "bg-emerald-400" },
    { label: "Failed",     value: counts.failed,     color: counts.failed > 0 ? "text-rose-400" : "text-white/25", dot: counts.failed > 0 ? "bg-rose-400" : "bg-white/10" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`p-6 sm:p-8 rounded-[28px] glass-card border-white/5 relative overflow-hidden transition-all duration-500`}
    >
      {/* Pressure glow */}
      <div className={`absolute inset-0 ${cfg.glow} pointer-events-none`} />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">
              Queue · 10s
            </p>
            <h2 className="text-xl font-black text-white uppercase tracking-tight italic">
              Queue Pressure
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${cfg.badge}`}>
              {cfg.label}
            </span>
            <div className={`text-2xl font-black ${cfg.text}`}>
              {activeTotal}
            </div>
          </div>
        </div>

        {/* Pressure bar */}
        <div className="mb-6">
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${cfg.bar}`}
              initial={{ width: 0 }}
              animate={{ width: `${cfg.pct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Status tiles */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {tiles.map((tile, i) => (
            <motion.div
              key={tile.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-black/20 border border-white/[0.04]"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${tile.dot}`} />
              <div className="min-w-0">
                <p className="text-[7px] text-white/25 uppercase tracking-widest truncate">
                  {tile.label}
                </p>
                <p className={`text-sm font-black ${tile.color}`}>
                  {tile.value}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom row: wait + throughput */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/[0.05]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
              <Clock size={12} className="text-white/40" />
            </div>
            <div>
              <p className="text-[7px] text-white/25 uppercase tracking-widest">Avg Wait</p>
              <p className="text-xs font-black text-white">{fmtWait(data.avgWaitMs)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
              <TrendingUp size={12} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[7px] text-white/25 uppercase tracking-widest">Last Hour</p>
              <p className="text-xs font-black text-emerald-400">{data.throughput.completedLastHour} done</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
              <Zap size={12} className="text-primary" />
            </div>
            <div>
              <p className="text-[7px] text-white/25 uppercase tracking-widest">24h Throughput</p>
              <p className="text-xs font-black text-white">{data.throughput.completedLast24h} done</p>
            </div>
          </div>
        </div>

        {/* Oldest queued job */}
        {data.oldestQueuedAt && counts.queued > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <AlertTriangle size={10} className="text-amber-400/60 shrink-0" />
            <p className="text-[8px] text-white/20">
              Oldest queued job waiting since {timeAgo(data.oldestQueuedAt)}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
