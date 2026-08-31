"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Sparkles, Mail, Lock, ArrowRight, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";

export default function AuthPage() {
  const router = useRouter();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === "signin") {
        const res = await signIn(email, password);
        if (res.error) {
          setError(res.error);
        } else {
          setSuccess("Signed in successfully! Redirecting to Dashboard...");
          setTimeout(() => router.push("/dashboard"), 1000);
        }
      } else {
        const res = await signUp(email, password, fullName);
        if (res.error) {
          setError(res.error);
        } else {
          setSuccess("Account created! Granting full access to Dashboard...");
          setTimeout(() => router.push("/dashboard"), 1000);
        }
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030712] relative overflow-hidden px-4 py-12">
      {/* Background Glow Orbs */}
      <div className="absolute top-[10%] left-[15%] w-[450px] h-[450px] bg-primary/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[10%] right-[15%] w-[400px] h-[400px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-[#7c3aed] flex items-center justify-center text-white shadow-xl shadow-primary/20 mb-4">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">EXCERPT</h1>
          <p className="text-sm text-white/50 mt-1 font-light">
            {mode === "signin"
              ? "Sign in to access your AI Video Clipping Workspace"
              : "Create an account for full instant access"}
          </p>
        </div>

        {/* Auth Card */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-6 sm:p-8 shadow-2xl">
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-black/40 rounded-xl mb-6 border border-white/5">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
              className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                mode === "signin"
                  ? "bg-primary text-white shadow-lg"
                  : "text-white/50 hover:text-white"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              className={`py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                mode === "signup"
                  ? "bg-primary text-white shadow-lg"
                  : "text-white/50 hover:text-white"
              }`}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs leading-relaxed font-medium">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs leading-relaxed font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-white/50 mb-2">
                  Full Name (Optional)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Enter your name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-slate-950/60 border border-white/10 rounded-xl py-3 px-4 text-xs font-medium text-white placeholder-white/20 focus:outline-none focus:border-primary/60 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-white/50 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-white/30">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs font-medium text-white placeholder-white/20 focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-white/50 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-white/30">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs font-medium text-white placeholder-white/20 focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 mt-6"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{mode === "signin" ? "Sign In & Launch" : "Create Account & Access"}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Guaranteed Access Note */}
          <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-center gap-2 text-[10px] text-white/40 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Instant full access granted upon sign in or registration</span>
          </div>
        </div>
      </div>
    </div>
  );
}
