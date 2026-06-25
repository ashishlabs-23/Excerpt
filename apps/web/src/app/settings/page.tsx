"use client";

import React from "react";
import { motion } from "framer-motion";
import { SidebarNav } from "@/components/SidebarNav";
import { Button } from "@/components/ui/button";
import { apiUrl, API_BASE_URL, authFetch, isPurgeEnabled } from "@/lib/api";
import { AuthGate } from "@/components/AuthGate";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  Shield,
  Trash2,
} from "lucide-react";

function SettingsContent() {
  const [health, setHealth] = React.useState<"loading" | "online" | "offline">(
    "loading"
  );
  const [isPurging, setIsPurging] = React.useState(false);
  const [purgeMessage, setPurgeMessage] = React.useState<string | null>(null);
  const [confirmation, setConfirmation] = React.useState("");

  const checkHealth = React.useCallback(async () => {
    setHealth("loading");
    try {
      const response = await authFetch("/api/system/health");
      setHealth(response.ok ? "online" : "offline");
    } catch (error) {
      console.error("[Settings]: Health check failed", error);
      setHealth("offline");
    }
  }, []);

  React.useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const handlePurge = async () => {
    if (!isPurgeEnabled || confirmation !== "PURGE") return;

    setIsPurging(true);
    setPurgeMessage(null);

    try {
      const response = await authFetch("/api/video/purge", {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Purge failed");
      }

      localStorage.removeItem("lastJobId");
      setPurgeMessage("Workspace cleared successfully.");
      setConfirmation("");
    } catch (error: any) {
      setPurgeMessage(error.message || "Unable to clear workspace.");
    } finally {
      setIsPurging(false);
    }
  };

  const statusClasses = {
    online: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    offline: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    loading: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  };

  return (
    <div className="flex min-h-screen lg:h-screen bg-[#030712] text-[#e0e5f6] relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] opacity-40" />
      <SidebarNav />

      <main className="flex-grow overflow-y-auto px-4 sm:px-6 lg:px-12 pt-8 sm:pt-10 pb-32 lg:pb-10 relative z-10">
        <div className="max-w-6xl mx-auto">
          <motion.header
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-[0.25em] text-white/40 font-black mb-4">
              Environment Controls
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white uppercase italic mb-4">
              System Settings
            </h1>
            <p className="text-white/40 max-w-2xl leading-relaxed">
              Review environment health, verify the API connection, and manage
              local development data safely.
            </p>
          </motion.header>

          <div className="grid gap-8 lg:grid-cols-[1.3fr_0.9fr]">
            <section className="space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-[28px] sm:rounded-[32px] glass-card p-5 sm:p-8"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6 mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">
                      API Connectivity
                    </h2>
                    <p className="text-sm text-white/35 max-w-xl">
                      The dashboard, uploader, and clip gallery depend on the API
                      endpoint below.
                    </p>
                  </div>
                  <div
                    className={`px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-[0.25em] ${statusClasses[health]}`}
                  >
                    {health}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 mb-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">
                    Active Endpoint
                  </p>
                  <p className="text-sm text-white break-all">{API_BASE_URL}</p>
                </div>

                <Button
                  variant="outline"
                  onClick={checkHealth}
                  className="h-12 rounded-xl border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-white"
                >
                  <RefreshCw size={16} className="mr-2" />
                  Re-check Health
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="rounded-[28px] sm:rounded-[32px] glass-card p-5 sm:p-8"
              >
                <h2 className="text-2xl font-bold text-white mb-6">
                  Workspace Notes
                </h2>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <Shield className="text-cyan-400 mb-3" size={20} />
                    <h3 className="text-sm font-bold text-white mb-2">
                      Safer Defaults
                    </h3>
                    <p className="text-xs text-white/35 leading-relaxed">
                      Destructive purge operations are disabled unless explicitly
                      allowed.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <Database className="text-emerald-400 mb-3" size={20} />
                    <h3 className="text-sm font-bold text-white mb-2">
                      Real Metrics
                    </h3>
                    <p className="text-xs text-white/35 leading-relaxed">
                      Dashboard stats now come from the API instead of placeholder
                      values.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <CheckCircle2 className="text-primary mb-3" size={20} />
                    <h3 className="text-sm font-bold text-white mb-2">
                      Working Navigation
                    </h3>
                    <p className="text-xs text-white/35 leading-relaxed">
                      Settings is now a real route, so the sidebar no longer
                      dead-ends.
                    </p>
                  </div>
                </div>
              </motion.div>
            </section>

            <motion.aside
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
                className="rounded-[28px] sm:rounded-[32px] glass-card p-5 sm:p-8 h-fit"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                  <Trash2 className="text-rose-400" size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Danger Zone</h2>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/30 font-black">
                    Local development only
                  </p>
                </div>
              </div>

              <p className="text-sm text-white/35 leading-relaxed mb-6">
                Clear stored clips, jobs, and local progress only when you need
                a clean test workspace.
              </p>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-5 mb-5">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 mb-3">
                  Confirmation Phrase
                </p>
                <input
                  value={confirmation}
                  onChange={(event) =>
                    setConfirmation(event.target.value.toUpperCase())
                  }
                  placeholder="Type PURGE"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-rose-500/40"
                />
              </div>

              <Button
                onClick={handlePurge}
                disabled={!isPurgeEnabled || confirmation !== "PURGE" || isPurging}
                className="w-full h-12 rounded-xl bg-rose-500 hover:bg-rose-500/90 text-white disabled:bg-white/5 disabled:text-white/20"
              >
                {isPurging ? "Clearing Workspace..." : "Clear Local Workspace"}
              </Button>

              {!isPurgeEnabled && (
                <div className="mt-4 flex gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-100">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  <p className="text-sm leading-relaxed">
                    Purge is disabled in this environment. Enable it only for
                    trusted local development.
                  </p>
                </div>
              )}

              {purgeMessage && (
                <p className="mt-4 text-sm text-white/55">{purgeMessage}</p>
              )}
            </motion.aside>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthGate>
      <SettingsContent />
    </AuthGate>
  );
}
