"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
  Cpu,
  Database,
  Film,
  ChevronRight,
  RotateCcw,
  Loader2,
  Terminal,
  Package,
  Zap,
} from "lucide-react";
import { authFetch } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobDetail {
  version: number;
  generatedAt: string;
  commit: string;
  job: {
    id: string;
    status: string;
    progress: number;
    videoUrl?: string;
    failedReason?: string;
    createdAt: string;
    updatedAt: string;
    generationMode?: string;
    cacheHit?: boolean;
  };
  performance: {
    totalMs: number | null;
    stageTimings: Array<{ stage: string; ms: number }>;
  };
  downloadAttempts: Array<{
    strategyId: string;
    result: string;
    duration_ms: number;
    httpStatus?: number;
    failureCategory?: string;
    downloadSpeedMbps?: number;
  }>;
  pipeline: {
    modulesRun: string[];
    modulesSkipped: string[];
    modulesFailed: string[];
  };
  debug: {
    stage?: string;
    operation?: string;
    errorType?: string;
    summary?: string;
    stderrTail?: string;
    rawMessage?: string;
    timestamp?: string;
  };
  clips: Array<{
    id: string;
    title?: string;
    status: string;
    storageUrl?: string;
    duration?: number;
    createdAt: string;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMs(ms: number | null | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function fmtDuration(sec?: number): string {
  if (!sec) return "—";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

const STATUS_DOT: Record<string, string> = {
  completed: "bg-emerald-400",
  failed:    "bg-rose-400",
  processing:"bg-amber-400 animate-pulse",
  queued:    "bg-blue-400",
  cancelled: "bg-white/20",
};
const STATUS_TEXT: Record<string, string> = {
  completed: "text-emerald-400",
  failed:    "text-rose-400",
  processing:"text-amber-400",
  queued:    "text-blue-400",
};

// ─── Sub-panels ───────────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={12} className="text-white/30" />
      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">{label}</p>
    </div>
  );
}

function StageTiming({ timings }: { timings: Array<{ stage: string; ms: number }> }) {
  if (!timings.length) return <p className="text-white/20 text-xs italic">No stage timings recorded yet.</p>;
  const maxMs = Math.max(...timings.map(t => t.ms));

  return (
    <div className="space-y-2">
      {timings.map((t, i) => (
        <div key={t.stage}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-white/40">{t.stage}</span>
            <span className="text-[9px] font-black text-white">{fmtMs(t.ms)}</span>
          </div>
          <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary/60"
              initial={{ width: 0 }}
              animate={{ width: `${(t.ms / maxMs) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.07 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DownloadWaterfall({ attempts }: { attempts: JobDetail["downloadAttempts"] }) {
  if (!attempts.length)
    return <p className="text-white/20 text-xs italic">No download attempts recorded.</p>;

  return (
    <div className="space-y-1">
      {attempts.map((a, i) => {
        const isSuccess = a.result === "success";
        const is429 = a.httpStatus === 429;
        const rowCls = isSuccess
          ? "border-emerald-500/15 bg-emerald-500/[0.03]"
          : is429
          ? "border-rose-500/20 bg-rose-500/[0.04]"
          : "border-rose-500/10 bg-rose-500/[0.02]";
        const dotCls = isSuccess ? "bg-emerald-400" : is429 ? "bg-rose-500 animate-pulse" : "bg-rose-400";
        const statusCls = isSuccess ? "text-emerald-400" : is429 ? "text-rose-400" : "text-rose-300";

        return (
          <React.Fragment key={i}>
            <motion.div
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${rowCls}`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${dotCls}`} />
              <span className="text-[7px] font-black text-white/20 shrink-0">#{i + 1}</span>
              <span className="text-[8px] font-black uppercase tracking-widest text-white/60 shrink-0">
                {a.strategyId}
              </span>
              {a.httpStatus && (
                <span className={`text-[8px] font-black ${statusCls} shrink-0`}>{a.httpStatus}</span>
              )}
              {a.failureCategory && (
                <span className="text-[7px] text-white/25 truncate hidden sm:block">
                  {a.failureCategory.replace(/_/g, " ")}
                </span>
              )}
              <div className="flex-1" />
              <span className="text-[8px] text-white/25 shrink-0">{fmtMs(a.duration_ms)}</span>
              {a.downloadSpeedMbps != null && (
                <span className="text-[7px] text-white/20 shrink-0 hidden sm:block">
                  {a.downloadSpeedMbps.toFixed(1)} Mbps
                </span>
              )}
              <span className={`text-[10px] font-black shrink-0 ${statusCls}`}>
                {isSuccess ? "✓" : "✗"}
              </span>
            </motion.div>
            {i < attempts.length - 1 && (
              <div className="flex items-center gap-1 pl-5">
                <div className="w-px h-1.5 bg-white/10" />
                <span className="text-[6px] text-white/15 uppercase tracking-widest">retry</span>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Main Inspector ───────────────────────────────────────────────────────────

interface Props {
  jobId: string;
  onClose: () => void;
}

export function JobDetailInspector({ jobId, onClose }: Props) {
  const [data, setData] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/api/system/jobs/${jobId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
    // Refresh every 10s if job is still active
    const iv = setInterval(() => {
      if (data?.job.status === "processing" || data?.job.status === "queued") load();
    }, 10_000);
    return () => clearInterval(iv);
  }, [load, data?.job.status]);

  const j = data?.job;
  const statusDot = STATUS_DOT[j?.status ?? ""] ?? "bg-white/20";
  const statusText = STATUS_TEXT[j?.status ?? ""] ?? "text-white/40";

  return (
    <AnimatePresence>
      <motion.div
        key="job-inspector-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="job-inspector-panel"
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.25 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-[28px] glass-card border-white/10 bg-[#0d0d0d]/95"
        >
          {/* ── Header ── */}
          <div className="sticky top-0 z-10 bg-[#0d0d0d]/95 backdrop-blur-sm px-6 pt-6 pb-4 border-b border-white/[0.06]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-1">
                  Job Inspector
                </p>
                <p className="text-xs font-mono text-white/40 truncate">{jobId}</p>
                {j && (
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                      <span className={`text-[10px] font-black uppercase ${statusText}`}>
                        {j.status}
                      </span>
                    </div>
                    {j.progress > 0 && j.status === "processing" && (
                      <span className="text-[9px] text-white/30">{j.progress}%</span>
                    )}
                    {j.generationMode && (
                      <span className="text-[8px] px-2 py-0.5 rounded bg-white/5 text-white/30 uppercase tracking-widest">
                        {j.generationMode}
                      </span>
                    )}
                    {j.cacheHit && (
                      <span className="text-[8px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest">
                        cache hit
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={load}
                  className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] transition-colors"
                  title="Refresh"
                >
                  <RotateCcw size={12} className="text-white/30" />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] transition-colors"
                >
                  <X size={14} className="text-white/40" />
                </button>
              </div>
            </div>

            {/* Video URL */}
            {j?.videoUrl && (
              <p className="mt-2 text-[9px] text-primary/60 truncate font-mono">
                {j.videoUrl}
              </p>
            )}
          </div>

          {/* ── Body ── */}
          {loading && (
            <div className="flex items-center justify-center h-64">
              <Loader2 size={18} className="animate-spin text-white/20" />
            </div>
          )}

          {error && (
            <div className="p-6">
              <div className="flex items-center gap-2 p-4 rounded-2xl bg-rose-500/[0.04] border border-rose-500/15">
                <AlertCircle size={13} className="text-rose-400 shrink-0" />
                <p className="text-rose-400 text-sm">{error}</p>
              </div>
            </div>
          )}

          {data && !loading && (
            <div className="p-6 space-y-8">
              {/* ── Timing overview ── */}
              {data.performance.totalMs && (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                  <Clock size={14} className="text-white/30 shrink-0" />
                  <div>
                    <p className="text-[8px] text-white/25 uppercase tracking-widest">Total Duration</p>
                    <p className="text-lg font-black text-white">{fmtMs(data.performance.totalMs)}</p>
                  </div>
                </div>
              )}

              {/* ── Stage timings ── */}
              {data.performance.stageTimings.length > 0 && (
                <section>
                  <SectionTitle icon={Zap} label="Stage Timings" />
                  <StageTiming timings={data.performance.stageTimings} />
                </section>
              )}

              {/* ── Download waterfall ── */}
              <section>
                <SectionTitle icon={Download} label={`Download Attempts (${data.downloadAttempts.length})`} />
                <DownloadWaterfall attempts={data.downloadAttempts} />
              </section>

              {/* ── Pipeline modules ── */}
              {(data.pipeline.modulesRun.length > 0 || data.pipeline.modulesFailed.length > 0) && (
                <section>
                  <SectionTitle icon={Cpu} label="Pipeline Modules" />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                      <p className="text-[7px] text-white/20 uppercase tracking-widest mb-2">Ran ({data.pipeline.modulesRun.length})</p>
                      <div className="flex flex-wrap gap-1">
                        {data.pipeline.modulesRun.slice(0, 12).map(m => (
                          <span key={m} className="text-[7px] px-1.5 py-0.5 rounded bg-emerald-500/5 text-emerald-400/60 border border-emerald-500/10">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                      <p className="text-[7px] text-white/20 uppercase tracking-widest mb-2">Skipped ({data.pipeline.modulesSkipped.length})</p>
                      <div className="flex flex-wrap gap-1">
                        {data.pipeline.modulesSkipped.slice(0, 8).map(m => (
                          <span key={m} className="text-[7px] px-1.5 py-0.5 rounded bg-white/[0.03] text-white/20 border border-white/[0.05]">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                      <p className="text-[7px] text-white/20 uppercase tracking-widest mb-2">Failed ({data.pipeline.modulesFailed.length})</p>
                      <div className="flex flex-wrap gap-1">
                        {data.pipeline.modulesFailed.slice(0, 8).map(m => (
                          <span key={m} className="text-[7px] px-1.5 py-0.5 rounded bg-rose-500/5 text-rose-400/60 border border-rose-500/10">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* ── Clips produced ── */}
              {data.clips.length > 0 && (
                <section>
                  <SectionTitle icon={Film} label={`Clips Produced (${data.clips.length})`} />
                  <div className="space-y-1.5">
                    {data.clips.map((c, i) => (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/[0.05] bg-white/[0.02]"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.status === "uploaded" ? "bg-emerald-400" : c.status === "failed" ? "bg-rose-400" : "bg-white/20"}`} />
                        <p className="text-xs text-white/70 font-medium truncate flex-1">{c.title ?? c.id.slice(0, 8)}</p>
                        {c.duration && (
                          <span className="text-[8px] text-white/25 shrink-0">{fmtDuration(c.duration)}</span>
                        )}
                        <span className="text-[8px] text-white/20 uppercase tracking-widest shrink-0">{c.status}</span>
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Error detail ── */}
              {(j?.failedReason || data.debug.summary) && (
                <section>
                  <SectionTitle icon={AlertCircle} label="Error Detail" />
                  <div className="p-4 rounded-2xl bg-rose-500/[0.03] border border-rose-500/15 space-y-3">
                    {j?.failedReason && (
                      <div>
                        <p className="text-[7px] text-white/25 uppercase tracking-widest mb-1">Failed Reason</p>
                        <p className="text-xs text-rose-300/80 font-mono leading-relaxed">{j.failedReason}</p>
                      </div>
                    )}
                    {data.debug.summary && (
                      <div>
                        <p className="text-[7px] text-white/25 uppercase tracking-widest mb-1">Summary</p>
                        <p className="text-xs text-white/50">{data.debug.summary}</p>
                      </div>
                    )}
                    {data.debug.errorType && (
                      <div className="flex items-center gap-2">
                        <p className="text-[7px] text-white/20 uppercase tracking-widest">Type:</p>
                        <span className="text-[8px] font-black text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 uppercase tracking-widest">
                          {data.debug.errorType}
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* ── stderr tail ── */}
              {data.debug.stderrTail && (
                <section>
                  <SectionTitle icon={Terminal} label="Stderr Tail" />
                  <div className="p-4 rounded-2xl bg-black/30 border border-white/[0.05] font-mono text-[9px] text-white/35 leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {data.debug.stderrTail}
                  </div>
                </section>
              )}

              {/* ── Metadata ── */}
              <section>
                <SectionTitle icon={Database} label="Metadata" />
                <div className="grid grid-cols-2 gap-2 text-[9px]">
                  {[
                    ["Job ID",      j?.id.slice(0, 8) + "…"],
                    ["Created",     j?.createdAt ? new Date(j.createdAt).toLocaleString() : "—"],
                    ["Updated",     j?.updatedAt ? new Date(j.updatedAt).toLocaleString() : "—"],
                    ["Commit",      data.commit?.slice(0, 7) ?? "—"],
                  ].map(([label, val]) => (
                    <div key={label} className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                      <p className="text-white/20 shrink-0">{label}:</p>
                      <p className="text-white/50 font-mono truncate">{val}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
