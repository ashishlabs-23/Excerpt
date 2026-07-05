"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  CheckCircle2,
  XCircle,
  Gauge,
  Clock,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import { DashboardData } from "@/lib/useDashboard";

interface Props {
  strategies: DashboardData["downloadStrategies"];
}

const STRATEGY_COLORS: Record<string, { badge: string; bar: string; icon: string }> = {
  "web-cookies": {
    badge: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    bar: "bg-blue-500",
    icon: "text-blue-400",
  },
  "tv-cookies": {
    badge: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    bar: "bg-indigo-500",
    icon: "text-indigo-400",
  },
  ios: {
    badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    bar: "bg-emerald-500",
    icon: "text-emerald-400",
  },
  android: {
    badge: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    bar: "bg-amber-500",
    icon: "text-amber-400",
  },
  unknown: {
    badge: "text-white/40 bg-white/5 border-white/10",
    bar: "bg-white/20",
    icon: "text-white/40",
  },
};

function fmtMs(ms: number | null | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function SuccessTrend({ rate }: { rate: number }) {
  if (rate >= 85)
    return <TrendingUp size={12} className="text-emerald-400" />;
  if (rate >= 60)
    return <Minus size={12} className="text-amber-400" />;
  return <TrendingDown size={12} className="text-rose-400" />;
}

export const DownloadStrategyExplorer: React.FC<Props> = ({ strategies }) => {
  if (!strategies || strategies.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 rounded-[28px] glass-card border-white/5"
      >
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">
          Download Engine
        </p>
        <h2 className="text-base font-black text-white uppercase tracking-tight mb-4">
          Strategy Explorer
        </h2>
        <p className="text-white/30 text-sm text-center py-6">
          No download attempts recorded yet. Strategies will appear after first job.
        </p>
      </motion.div>
    );
  }

  // Check if strategies have a parsing error
  if ((strategies[0] as any)?.error) {
    return (
      <div className="p-6 rounded-[28px] glass-card border-rose-500/20">
        <p className="text-rose-400 text-sm">
          Strategy data unavailable: {(strategies[0] as any).error}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="p-6 sm:p-8 rounded-[28px] glass-card border-white/5 hover:border-white/10 transition-all duration-500 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.04),transparent_50%)] pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">
              Download Engine v2.0
            </p>
            <h2 className="text-xl font-black text-white uppercase tracking-tight italic">
              Strategy Explorer
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Download size={13} className="text-primary" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">
              {strategies.reduce((a, s) => a + s.attempts, 0).toLocaleString()} total attempts
            </span>
          </div>
        </div>

        {/* Strategy table */}
        <div className="space-y-3">
          {/* Column headers */}
          <div className="grid grid-cols-12 gap-2 px-3 mb-1">
            <div className="col-span-3 text-[8px] font-bold uppercase tracking-widest text-white/25">
              Strategy
            </div>
            <div className="col-span-2 text-[8px] font-bold uppercase tracking-widest text-white/25 text-right">
              Attempts
            </div>
            <div className="col-span-3 text-[8px] font-bold uppercase tracking-widest text-white/25 text-center">
              Success Rate
            </div>
            <div className="col-span-2 text-[8px] font-bold uppercase tracking-widest text-white/25 text-right hidden sm:block">
              Avg Speed
            </div>
            <div className="col-span-2 text-[8px] font-bold uppercase tracking-widest text-white/25 text-right">
              Top Failure
            </div>
          </div>

          <AnimatePresence>
            {strategies.map((s, i) => {
              const colors =
                STRATEGY_COLORS[s.id] ?? STRATEGY_COLORS["unknown"];

              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="grid grid-cols-12 gap-2 items-center p-4 rounded-2xl border border-white/[0.05] bg-black/20 hover:border-white/10 transition-all"
                >
                  {/* Strategy name */}
                  <div className="col-span-3 flex items-center gap-2">
                    <span
                      className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border ${colors.badge}`}
                    >
                      {s.id}
                    </span>
                  </div>

                  {/* Attempts */}
                  <div className="col-span-2 text-right">
                    <span className="text-sm font-black text-white">
                      {s.attempts}
                    </span>
                    <span className="text-[8px] text-white/25 ml-1">
                      ({s.successes}✓)
                    </span>
                  </div>

                  {/* Success rate with bar */}
                  <div className="col-span-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <SuccessTrend rate={s.successRate} />
                        <span
                          className={`text-xs font-black ${
                            s.successRate >= 85
                              ? "text-emerald-400"
                              : s.successRate >= 60
                              ? "text-amber-400"
                              : "text-rose-400"
                          }`}
                        >
                          {s.successRate}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${colors.bar}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${s.successRate}%` }}
                        transition={{ duration: 0.8, delay: i * 0.1 }}
                      />
                    </div>
                  </div>

                  {/* Avg speed */}
                  <div className="col-span-2 text-right hidden sm:flex items-center justify-end gap-1">
                    <Gauge size={10} className={colors.icon} />
                    <span className="text-xs font-bold text-white">
                      {s.avgSpeedMbps !== null
                        ? `${s.avgSpeedMbps} Mbps`
                        : "—"}
                    </span>
                  </div>

                  {/* Top failure */}
                  <div className="col-span-2 text-right">
                    {s.topFailure ? (
                      <span className="text-[8px] font-bold text-rose-400/80 bg-rose-500/10 px-1.5 py-0.5 rounded">
                        {s.topFailure.replace("_", " ")}
                      </span>
                    ) : (
                      <span className="text-[8px] text-white/20">None</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Legend */}
        <div className="mt-4 pt-4 border-t border-white/[0.05] flex items-center gap-4 text-[8px] text-white/20 uppercase tracking-widest">
          <div className="flex items-center gap-1">
            <TrendingUp size={8} className="text-emerald-400" />
            ≥85%
          </div>
          <div className="flex items-center gap-1">
            <Minus size={8} className="text-amber-400" />
            60–84%
          </div>
          <div className="flex items-center gap-1">
            <TrendingDown size={8} className="text-rose-400" />
            &lt;60%
          </div>
        </div>
      </div>
    </motion.div>
  );
};
