"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { JobDetailInspector } from "@/components/JobDetailInspector";
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Download,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { authFetch } from "@/lib/api";

interface DownloadAttempt {
  strategyId: string;
  client?: string;
  result: string;
  duration_ms: number;
  downloadSpeedMbps?: number;
  httpStatus?: number;
  failureCategory?: string;
  stderr_tail?: string;
}

interface JobAttempt {
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  success?: boolean;
  error?: string;
}

interface TelemetryJob {
  id: string;
  status: string;
  progress: number;
  videoUrl?: string;
  failedReason?: string;
  createdAt: string;
  updatedAt: string;
  downloadAttempts: DownloadAttempt[];
  jobAttempts: JobAttempt[];
  totalDurationMs?: number;
  generationMode?: string;
}

function fmtMs(ms: number | undefined | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "text-emerald-400",
  failed: "text-rose-400",
  processing: "text-amber-400",
  queued: "text-blue-400",
};

const STRATEGY_BADGE: Record<string, string> = {
  "web-cookies": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "tv-cookies": "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  ios: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  android: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

// Color-codes an attempt row by outcome: green = success, amber = 4xx client error,
// rose-red = 429/5xx/timeout/bot-detect, so operators can parse a retry cascade at a glance.
function getAttemptColors(attempt: DownloadAttempt): {
  row: string;
  dot: string;
  dotAnim: string;
  statusText: string;
} {
  const isSuccess = attempt.result === "success";
  const http = attempt.httpStatus ?? 0;
  const cat = (attempt.failureCategory ?? "").toLowerCase();

  if (isSuccess) {
    return {
      row: "border-emerald-500/15 bg-emerald-500/[0.03]",
      dot: "bg-emerald-400",
      dotAnim: "",
      statusText: "text-emerald-400",
    };
  }
  // 429 rate-limit / bot-detection / quota
  if (http === 429 || cat.includes("rate") || cat.includes("quota") || cat.includes("bot")) {
    return {
      row: "border-rose-500/20 bg-rose-500/[0.04]",
      dot: "bg-rose-500",
      dotAnim: "animate-pulse",
      statusText: "text-rose-400",
    };
  }
  // Generic 4xx client errors
  if (http >= 400 && http < 500) {
    return {
      row: "border-amber-500/15 bg-amber-500/[0.03]",
      dot: "bg-amber-400",
      dotAnim: "",
      statusText: "text-amber-400",
    };
  }
  // 5xx / timeout / network
  return {
    row: "border-rose-500/15 bg-rose-500/[0.03]",
    dot: "bg-rose-400",
    dotAnim: "",
    statusText: "text-rose-400",
  };
}

function DownloadAttemptTimeline({
  attempts,
}: {
  attempts: DownloadAttempt[];
}) {
  if (attempts.length === 0) {
    return (
      <p className="text-white/25 text-xs italic">
        No download attempt data stored yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1 mt-2">
      {attempts.map((attempt, i) => {
        const isSuccess = attempt.result === "success";
        const badge =
          STRATEGY_BADGE[attempt.strategyId] ??
          "bg-white/5 text-white/40 border-white/10";
        const colors = getAttemptColors(attempt);
        const isLast = i === attempts.length - 1;

        return (
          <React.Fragment key={i}>
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${colors.row}`}
            >
              {/* Attempt number + dot */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <span className={`w-2.5 h-2.5 rounded-full ${colors.dot} ${colors.dotAnim}`} />
                <span className="text-[7px] font-black text-white/20">#{i + 1}</span>
              </div>

              {/* Strategy badge */}
              <span
                className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border shrink-0 ${badge}`}
              >
                {attempt.strategyId}
              </span>

              {/* HTTP status */}
              {attempt.httpStatus && (
                <span className={`text-[9px] font-black ${colors.statusText} shrink-0`}>
                  {attempt.httpStatus}
                </span>
              )}

              {/* Failure category */}
              {attempt.failureCategory && (
                <span className="text-[8px] text-white/30 truncate hidden sm:block">
                  {attempt.failureCategory.replace(/_/g, " ")}
                </span>
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Duration */}
              <div className="flex items-center gap-1 text-[9px] text-white/30 shrink-0">
                <Clock size={8} />
                {fmtMs(attempt.duration_ms)}
              </div>

              {/* Speed */}
              {attempt.downloadSpeedMbps != null && (
                <span className="text-[8px] text-white/25 shrink-0 hidden sm:block">
                  {attempt.downloadSpeedMbps.toFixed(1)} Mbps
                </span>
              )}

              {/* Result */}
              <span className={`text-[9px] font-black shrink-0 ${colors.statusText}`}>
                {isSuccess ? "✓" : "✗"}
              </span>
            </motion.div>

            {/* Connector arrow between attempts */}
            {!isLast && (
              <div className="flex items-center gap-1 pl-4">
                <div className="w-px h-2 bg-white/10" />
                <span className="text-[7px] text-white/15 uppercase tracking-widest">retry</span>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function JobRow({ job, onInspect }: { job: TelemetryJob, onInspect: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasAttempts =
    job.downloadAttempts.length > 0 || job.jobAttempts.length > 0;
  const statusColor = STATUS_COLORS[job.status] ?? "text-white/50";

  return (
    <motion.div
      layout
      className="rounded-2xl border border-white/[0.05] bg-black/20 overflow-hidden"
    >
      {/* Row header — always visible */}
      <div
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Status dot */}
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              job.status === "processing"
                ? "bg-amber-400 animate-pulse"
                : job.status === "completed"
                ? "bg-emerald-400"
                : job.status === "failed"
                ? "bg-rose-400"
                : "bg-blue-400"
            }`}
          />

          {/* Job info */}
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate max-w-[180px] sm:max-w-sm">
              {job.videoUrl?.replace(/^https?:\/\/(www\.)?/, "") ?? job.id.slice(0, 8)}
            </p>
            <div className="flex items-center gap-3 mt-0.5">
              <span className={`text-[9px] font-black uppercase ${statusColor}`}>
                {job.status}
              </span>
              {job.progress > 0 && job.status === "processing" && (
                <span className="text-[9px] text-white/30">
                  {job.progress}%
                </span>
              )}
              {job.totalDurationMs && (
                <span className="text-[9px] text-white/25">
                  {fmtMs(job.totalDurationMs)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right side: attempt count + inspect button + chevron */}
        <div className="flex items-center gap-3 shrink-0 ml-3">
          {hasAttempts && (
            <span className="text-[8px] font-black text-white/25 bg-white/5 px-2 py-0.5 rounded hidden sm:block">
              {job.downloadAttempts.length} dl attempt{job.downloadAttempts.length !== 1 ? "s" : ""}
              {job.jobAttempts.length > 0 &&
                ` · ${job.jobAttempts.length} retry`}
            </span>
          )}
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInspect();
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.03] hover:bg-white/[0.08] transition-colors border border-white/[0.05]"
          >
            <span className="text-[8px] font-black uppercase tracking-widest text-white/40">
              Inspect
            </span>
            <ChevronRight size={10} className="text-white/40" />
          </button>

          <div className="text-white/25 ml-1">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
        </div>
      </div>

      {/* Expanded telemetry */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-white/[0.05]">
              {/* Download attempts */}
              {job.downloadAttempts.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Download size={10} className="text-primary" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40">
                      Download Strategies
                    </p>
                  </div>
                  <DownloadAttemptTimeline attempts={job.downloadAttempts} />
                </div>
              )}

              {/* Job-level retry attempts */}
              {job.jobAttempts.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <RotateCcw size={10} className="text-amber-400" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/40">
                      Worker Retries (Option B)
                    </p>
                  </div>
                  <div className="space-y-2">
                    {job.jobAttempts.map((attempt, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-3 p-3 rounded-xl border text-[9px] ${
                          attempt.success
                            ? "border-emerald-500/15 bg-emerald-500/[0.03]"
                            : "border-rose-500/15 bg-rose-500/[0.03]"
                        }`}
                      >
                        {attempt.success ? (
                          <CheckCircle2 size={11} className="text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle size={11} className="text-rose-400 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 text-white/30">
                            <span>Attempt #{i + 1}</span>
                            {attempt.durationMs && (
                              <span>{fmtMs(attempt.durationMs)}</span>
                            )}
                            <span
                              className={
                                attempt.success
                                  ? "text-emerald-400 font-bold"
                                  : "text-rose-400 font-bold"
                              }
                            >
                              {attempt.success ? "Success" : "Failed"}
                            </span>
                          </div>
                          {attempt.error && (
                            <p className="text-rose-400/60 mt-1 truncate">
                              {attempt.error.slice(0, 120)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Failed reason */}
              {job.failedReason && (
                <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-rose-500/[0.04] border border-rose-500/15">
                  <AlertCircle size={11} className="text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-[9px] text-rose-400/80 leading-relaxed">
                    {job.failedReason.slice(0, 200)}
                  </p>
                </div>
              )}

              {!hasAttempts && !job.failedReason && (
                <p className="mt-3 text-white/25 text-xs italic text-center py-4">
                  No telemetry stored for this job yet. Telemetry is captured during processing.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export const RetryTelemetryCard: React.FC = () => {
  const [jobs, setJobs] = useState<TelemetryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspectJobId, setInspectJobId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await authFetch("/api/system/jobs/retry-telemetry?limit=15");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setJobs(data.jobs ?? []);
        setError(null);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 15_000);
    return () => clearInterval(iv);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="p-6 sm:p-8 rounded-[28px] glass-card border-white/5 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_rgba(239,68,68,0.03),transparent_50%)] pointer-events-none" />

      {/* Job Detail Inspector modal */}
      {inspectJobId && (
        <JobDetailInspector
          jobId={inspectJobId}
          onClose={() => setInspectJobId(null)}
        />
      )}

      <div className="relative z-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">
              Option B Retry System
            </p>
            <h2 className="text-xl font-black text-white uppercase tracking-tight italic">
              Retry Telemetry
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <RotateCcw size={12} className="text-primary" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">
              Last 15 Jobs
            </span>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-3 text-white/30">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading telemetry…</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-500/[0.04] border border-rose-500/20">
            <AlertCircle size={16} className="text-rose-400 shrink-0" />
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-8">
            No jobs found. Submit a job to see retry telemetry here.
          </p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onInspect={() => setInspectJobId(job.id)} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
