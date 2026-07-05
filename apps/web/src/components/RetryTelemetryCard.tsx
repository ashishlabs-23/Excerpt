"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
    <div className="flex flex-col gap-2 mt-2">
      {attempts.map((attempt, i) => {
        const isSuccess = attempt.result === "success";
        const badge =
          STRATEGY_BADGE[attempt.strategyId] ??
          "bg-white/5 text-white/40 border-white/10";

        return (
          <React.Fragment key={i}>
            {/* Connector line */}
            {i > 0 && (
              <div className="flex justify-start pl-4">
                <div className="w-px h-3 bg-white/10" />
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                isSuccess
                  ? "border-emerald-500/15 bg-emerald-500/[0.03]"
                  : "border-rose-500/15 bg-rose-500/[0.03]"
              }`}
            >
              {/* Status icon */}
              <div className="shrink-0 mt-0.5">
                {isSuccess ? (
                  <CheckCircle2 size={13} className="text-emerald-400" />
                ) : (
                  <XCircle size={13} className="text-rose-400" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span
                    className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${badge}`}
                  >
                    {attempt.strategyId}
                  </span>
                  {attempt.httpStatus && (
                    <span className="text-[8px] font-bold text-rose-400/80">
                      HTTP {attempt.httpStatus}
                    </span>
                  )}
                  {attempt.failureCategory && (
                    <span className="text-[8px] text-white/30">
                      {attempt.failureCategory.replace(/_/g, " ")}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-[9px] text-white/30">
                  <div className="flex items-center gap-1">
                    <Clock size={9} />
                    {fmtMs(attempt.duration_ms)}
                  </div>
                  {attempt.downloadSpeedMbps != null && (
                    <span>
                      {attempt.downloadSpeedMbps.toFixed(1)} Mbps
                    </span>
                  )}
                  <span
                    className={`font-bold ${
                      isSuccess ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {isSuccess ? "Success" : "Failed"}
                  </span>
                </div>
              </div>

              {/* Attempt number */}
              <span className="text-[8px] font-black text-white/15 shrink-0">
                #{i + 1}
              </span>
            </motion.div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function JobRow({ job }: { job: TelemetryJob }) {
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
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors text-left"
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

        {/* Right side: attempt count + chevron */}
        <div className="flex items-center gap-3 shrink-0 ml-3">
          {hasAttempts && (
            <span className="text-[8px] font-black text-white/25 bg-white/5 px-2 py-0.5 rounded">
              {job.downloadAttempts.length} dl attempt{job.downloadAttempts.length !== 1 ? "s" : ""}
              {job.jobAttempts.length > 0 &&
                ` · ${job.jobAttempts.length} retry`}
            </span>
          )}
          <div className="text-white/25">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </div>
        </div>
      </button>

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
    const iv = setInterval(load, 20000);
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
              <JobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
