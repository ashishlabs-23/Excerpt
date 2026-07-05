"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { useAlerts } from "@/lib/useDashboard";
import { authFetch } from "@/lib/api";

const SEVERITY_CONFIG = {
  error: {
    icon: AlertCircle,
    bar: "bg-rose-500",
    badge: "text-rose-400 bg-rose-500/10 border-rose-500/25",
    card: "border-rose-500/15 bg-rose-500/[0.03]",
    label: "Error",
    dot: "bg-rose-500 animate-pulse",
  },
  warning: {
    icon: AlertTriangle,
    bar: "bg-amber-500",
    badge: "text-amber-400 bg-amber-500/10 border-amber-500/25",
    card: "border-amber-500/15 bg-amber-500/[0.03]",
    label: "Warning",
    dot: "bg-amber-500 animate-pulse",
  },
  info: {
    icon: Info,
    bar: "bg-blue-500",
    badge: "text-blue-400 bg-blue-500/10 border-blue-500/25",
    card: "border-blue-500/15 bg-blue-500/[0.03]",
    label: "Info",
    dot: "bg-blue-500",
  },
} as const;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function SystemAlerts() {
  const { data, loading, error, lastFetchedAt, refresh } = useAlerts();

  const alerts = data?.alerts ?? [];
  const count = data?.count ?? 0;
  const hasErrors = alerts.some((a) => a.severity === "error");
  const hasWarnings = alerts.some((a) => a.severity === "warning");

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`rounded-[28px] border relative overflow-hidden transition-all duration-500 ${
        loading && !data
          ? "border-white/5 bg-transparent"
          : count === 0
          ? "border-emerald-500/10 bg-emerald-500/[0.02]"
          : hasErrors
          ? "border-rose-500/20 bg-rose-500/[0.02]"
          : "border-amber-500/15 bg-amber-500/[0.02]"
      }`}
    >
      {/* Top accent bar */}
      {count > 0 && (
        <div
          className={`absolute top-0 left-0 right-0 h-[2px] ${
            hasErrors ? "bg-rose-500" : hasWarnings ? "bg-amber-500" : "bg-blue-500"
          }`}
        />
      )}

      <div className="p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">
              System Alerts
            </p>
            {loading && !data && (
              <Loader2 size={10} className="text-white/20 animate-spin" />
            )}
            {lastFetchedAt && (
              <span className="text-[8px] text-white/15 uppercase tracking-widest">
                · 10s poll
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {count > 0 && (
              <span
                className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${
                  hasErrors
                    ? "text-rose-400 bg-rose-500/10 border-rose-500/25"
                    : "text-amber-400 bg-amber-500/10 border-amber-500/25"
                }`}
              >
                {count} alert{count !== 1 ? "s" : ""}
              </span>
            )}
            <button
              onClick={refresh}
              className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] transition-colors"
            >
              <RefreshCcw size={10} className="text-white/30" />
            </button>
          </div>
        </div>

        {/* All clear */}
        {!loading && count === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 py-2"
          >
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-400/80 font-medium">
              All systems nominal — no alerts detected
            </p>
          </motion.div>
        )}

        {/* Alert list */}
        <AnimatePresence>
          {alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.map((alert, i) => {
                const cfg = SEVERITY_CONFIG[alert.severity];
                const Icon = cfg.icon;
                const isAck = alert.state === 'ACKNOWLEDGED';

                return (
                  <motion.div
                    key={alert.dbId}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ delay: i * 0.05 }}
                    className={`flex items-start gap-4 p-4 rounded-2xl border relative overflow-hidden ${
                      isAck ? "border-white/[0.05] bg-white/[0.02] opacity-60 hover:opacity-100" : cfg.card
                    }`}
                  >
                    {/* Left severity bar */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-0.5 ${cfg.bar}`}
                    />

                    <div className="pl-1 shrink-0 mt-0.5">
                      <Icon size={15} className={isAck ? "text-white/40" : cfg.badge.split(" ")[0]} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className={`text-sm font-bold leading-tight ${isAck ? "text-white/60" : "text-white"}`}>
                          {alert.title}
                        </p>
                        <span
                          className={`text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${isAck ? "text-white/40 border-white/10" : cfg.badge}`}
                        >
                          {cfg.label}
                        </span>
                        {isAck && (
                          <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border text-emerald-400/80 border-emerald-500/20 bg-emerald-500/10">
                            Acknowledged
                          </span>
                        )}
                      </div>
                      <p className={`text-[10px] leading-relaxed ${isAck ? "text-white/30" : "text-white/40"}`}>
                        {alert.detail}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0 mt-0.5">
                      <span className="text-[8px] text-white/20">
                        {timeAgo(alert.detectedAt)}
                      </span>
                      <div className="flex items-center gap-2">
                        {!isAck && (
                          <button
                            onClick={async () => {
                              try {
                                await authFetch(`/api/system/alerts/${alert.dbId}/acknowledge`, { method: "POST" });
                                refresh();
                              } catch {}
                            }}
                            className="text-[8px] font-bold text-white/40 hover:text-white transition-colors"
                          >
                            ACKNOWLEDGE
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            try {
                              await authFetch(`/api/system/alerts/${alert.dbId}/resolve`, { method: "POST" });
                              refresh();
                            } catch {}
                          }}
                          className="text-[8px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-2 py-1 rounded"
                        >
                          RESOLVE
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>

        {error && (
          <p className="text-rose-400/50 text-xs mt-2">Alert feed unavailable: {error}</p>
        )}
      </div>
    </motion.div>
  );
}
