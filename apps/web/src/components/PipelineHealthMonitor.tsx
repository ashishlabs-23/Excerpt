"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  ArrowRight,
} from "lucide-react";
import { DashboardData } from "@/lib/useDashboard";

interface Props {
  pipeline: DashboardData["pipeline"];
}

const STAGE_ORDER = [
  "DOWNLOAD",
  "TRANSCRIPTION",
  "AI_ANALYSIS",
  "SEGMENTATION",
  "RANKING",
  "RENDER",
  "UPLOAD",
  "RETENTION",
];

const STAGE_LABELS: Record<string, string> = {
  DOWNLOAD: "Download",
  TRANSCRIPTION: "Transcription",
  AI_ANALYSIS: "AI Analysis",
  SEGMENTATION: "Segmentation",
  RANKING: "Ranking",
  RENDER: "Render",
  UPLOAD: "Upload",
  RETENTION: "Retention",
};

const STAGE_COLORS: Record<string, string> = {
  DOWNLOAD: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  TRANSCRIPTION: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  AI_ANALYSIS: "text-primary bg-primary/10 border-primary/20",
  SEGMENTATION: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  RANKING: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  RENDER: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  UPLOAD: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  RETENTION: "text-rose-400 bg-rose-500/10 border-rose-500/20",
};

function fmtMs(ms: number | null | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export const PipelineHealthMonitor: React.FC<Props> = ({ pipeline }) => {
  const stages = STAGE_ORDER.map((name) =>
    pipeline.find((s) => s.name === name)
  ).filter(Boolean) as DashboardData["pipeline"];

  const summary = pipeline.find((s) => s.name === "SUMMARY");
  const hasError = pipeline.some((s) => s.error);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="p-6 sm:p-8 rounded-[28px] glass-card border-white/5 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(200,119,64,0.04),transparent_50%)] pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">
              Production Pipeline
            </p>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight italic">
              Pipeline Health
            </h2>
          </div>
          {summary && (
            <div className="flex items-center gap-4 text-xs">
              <div className="text-center">
                <p className="text-white/30 text-[8px] uppercase tracking-widest">Jobs (24h)</p>
                <p className="text-white font-black text-lg">{summary.total24h ?? 0}</p>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <p className="text-white/30 text-[8px] uppercase tracking-widest">Success</p>
                <p className={`font-black text-lg ${(summary.successRate ?? 0) >= 90 ? "text-emerald-400" : "text-rose-400"}`}>
                  {summary.successRate ?? 0}%
                </p>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <p className="text-white/30 text-[8px] uppercase tracking-widest">Processing</p>
                <p className="text-amber-400 font-black text-lg">{summary.processing ?? 0}</p>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <p className="text-white/30 text-[8px] uppercase tracking-widest">Queued</p>
                <p className="text-blue-400 font-black text-lg">{summary.queued ?? 0}</p>
              </div>
            </div>
          )}
        </div>

        {/* Pipeline flow */}
        <div className="space-y-2">
          {stages.map((stage, i) => {
            const colorClass =
              STAGE_COLORS[stage.name] ??
              "text-white/60 bg-white/5 border-white/10";
            const isDegraded = stage.status === "degraded";
            const failures = stage.failures24h ?? 0;

            return (
              <motion.div
                key={stage.name}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="flex items-center gap-4"
              >
                {/* Stage card */}
                <div
                  className={`flex-1 flex items-center justify-between p-4 rounded-2xl border transition-all hover:brightness-110 ${
                    isDegraded
                      ? "border-rose-500/30 bg-rose-500/[0.04]"
                      : "border-white/[0.06] bg-black/20"
                  }`}
                >
                  {/* Left: badge + name */}
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${colorClass}`}
                    >
                      {STAGE_LABELS[stage.name] ?? stage.name}
                    </span>
                    {isDegraded ? (
                      <AlertTriangle size={12} className="text-rose-400" />
                    ) : (
                      <CheckCircle2 size={12} className="text-emerald-400/60" />
                    )}
                  </div>

                  {/* Right: metrics */}
                  <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                      <p className="text-[8px] text-white/25 uppercase tracking-widest">Avg Duration</p>
                      <p className="text-xs font-bold text-white">
                        {fmtMs(stage.avgDurationMs)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] text-white/25 uppercase tracking-widest">Failures 24h</p>
                      <p
                        className={`text-xs font-black ${
                          failures > 5
                            ? "text-rose-400"
                            : failures > 0
                            ? "text-amber-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {failures}
                      </p>
                    </div>
                    <div
                      className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                        isDegraded
                          ? "text-rose-400 bg-rose-500/10"
                          : "text-emerald-400 bg-emerald-500/10"
                      }`}
                    >
                      {isDegraded ? "DEGRADED" : "OK"}
                    </div>
                  </div>
                </div>

                {/* Arrow connector (not last) */}
                {i < stages.length - 1 && (
                  <div className="flex flex-col items-center shrink-0 w-4">
                    <ChevronDown size={12} className="text-white/20" />
                  </div>
                )}
              </motion.div>
            );
          })}

          {hasError && (
            <p className="text-rose-400/60 text-xs mt-2">
              Pipeline data partially unavailable.
            </p>
          )}

          {stages.length === 0 && (
            <p className="text-white/30 text-sm text-center py-8">
              No pipeline data yet. Jobs will appear here after first run.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
};
