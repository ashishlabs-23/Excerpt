"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Zap,
  Activity,
  Database,
  Server,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowDown,
} from "lucide-react";
import { DashboardData } from "@/lib/useDashboard";

interface Props {
  providers: DashboardData["providers"];
}

const PROVIDER_ICONS: Record<string, React.ElementType> = {
  Gemini: Zap,
  Groq: Activity,
  Ollama: Server,
  "Analysis Cache": Database,
};

const PROVIDER_COLORS: Record<string, string> = {
  Gemini: "text-primary",
  Groq: "text-amber-400",
  Ollama: "text-emerald-400",
  "Analysis Cache": "text-blue-400",
};

const ROLE_LABELS: Record<string, string> = {
  primary: "Primary",
  secondary: "Fallback",
  local_fallback: "Local",
  cache_fallback: "Cache",
};

const STATUS_DISPLAY: Record<
  string,
  { label: string; color: string; dot: string }
> = {
  configured: {
    label: "Configured",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    dot: "bg-emerald-400",
  },
  unconfigured: {
    label: "Not Configured",
    color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    dot: "bg-rose-400",
  },
  standby: {
    label: "Standby",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    dot: "bg-amber-400",
  },
  always_available: {
    label: "Always On",
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    dot: "bg-blue-400 animate-pulse",
  },
};

export const AIProviderStatusBar: React.FC<Props> = ({ providers }) => {
  const allConfigured = providers
    .filter((p) => p.role === "primary" || p.role === "secondary")
    .every((p) => p.configured);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="p-6 sm:p-8 rounded-[28px] glass-card border-white/5 hover:border-white/10 transition-all duration-500 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.04),transparent_60%)] pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">
              AI Stack
            </p>
            <h2 className="text-base font-black text-white uppercase tracking-tight">
              Provider Chain
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {allConfigured ? (
              <CheckCircle2 size={12} className="text-emerald-400" />
            ) : (
              <AlertCircle size={12} className="text-amber-400" />
            )}
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">
              {allConfigured ? "Full Coverage" : "Partial"}
            </span>
          </div>
        </div>

        {/* Provider chain - vertical with arrows */}
        <div className="space-y-2">
          {providers.map((provider, i) => {
            const Icon = PROVIDER_ICONS[provider.name] ?? Zap;
            const colorClass =
              PROVIDER_COLORS[provider.name] ?? "text-white/60";
            const statusDisplay =
              STATUS_DISPLAY[provider.status] ?? STATUS_DISPLAY["standby"];
            const isLast = i === providers.length - 1;

            return (
              <React.Fragment key={provider.name}>
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-white/[0.05] bg-black/20 hover:border-white/10 transition-all"
                >
                  {/* Icon + name */}
                  <div
                    className={`w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0 ${colorClass}`}
                  >
                    <Icon size={16} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-black text-white">
                        {provider.name}
                      </p>
                      <span className="text-[8px] font-bold uppercase tracking-widest text-white/25 bg-white/5 px-1.5 py-0.5 rounded">
                        {ROLE_LABELS[provider.role] ?? provider.role}
                      </span>
                    </div>

                    {/* Sub-info */}
                    <div className="flex items-center gap-3 text-[9px] text-white/30">
                      {provider.keyCount !== undefined && (
                        <span>{provider.keyCount} key{provider.keyCount !== 1 ? "s" : ""}</span>
                      )}
                      {provider.activeKeyIndex !== undefined && (
                        <span>Active: #{provider.activeKeyIndex + 1}</span>
                      )}
                      {provider.lastLatencyMs !== null &&
                        provider.lastLatencyMs !== undefined && (
                          <span>{provider.lastLatencyMs}ms last req</span>
                        )}
                      {provider.endpoint && (
                        <span className="truncate max-w-[120px]">
                          {provider.endpoint}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest shrink-0 ${statusDisplay.color}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusDisplay.dot}`} />
                    {statusDisplay.label}
                  </div>
                </motion.div>

                {/* Arrow between providers */}
                {!isLast && (
                  <div className="flex justify-center py-0.5">
                    <div className="flex items-center gap-1 text-white/15">
                      <ArrowDown size={10} />
                      <span className="text-[7px] uppercase tracking-widest">
                        fallback
                      </span>
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};
