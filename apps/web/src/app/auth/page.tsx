"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Lock, Mail, User, Sparkles, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AuthPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("ashish@gamil.com");
  const [password, setPassword] = useState("password123");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  if (loading || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#030712]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    if (mode === "signin") {
      const result = await signIn(email.trim(), password);
      if (result.error) {
        setError(result.error);
        setSubmitting(false);
      }
      // On success, the auth state change will redirect via useEffect above
    } else {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        setSubmitting(false);
        return;
      }
      const result = await signUp(email.trim(), password, fullName.trim());
      if (result.error) {
        setError(result.error);
      } else {
        setSuccessMessage(
          "Account created! Check your email to confirm, then sign in."
        );
        setMode("signin");
        setPassword("");
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-[#030712] px-4 overflow-hidden">
      {/* Animated background blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px] animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-violet-600/10 blur-[120px] animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-blue-600/5 blur-[80px]" />
      </div>

      {/* Back to home */}
      <Link
        href="/"
        className="absolute top-6 left-6 text-white/40 hover:text-white text-sm font-medium flex items-center gap-2 transition-colors group"
      >
        <span className="group-hover:-translate-x-1 transition-transform">←</span>
        Back to home
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md"
      >
        {/* Card */}
        <div className="rounded-[32px] border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 shadow-2xl shadow-black/50">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <motion.div
              className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center text-white shadow-lg shadow-primary/30"
              whileHover={{ rotate: 10, scale: 1.05 }}
            >
              <Sparkles className="w-6 h-6" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-black text-white uppercase italic tracking-tight">
                Excerpt
              </h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-bold">
                {mode === "signin" ? "Welcome back" : "Create your account"}
              </p>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-2xl bg-white/[0.04] border border-white/[0.06] p-1 mb-6">
            {(["signin", "signup"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setMode(tab);
                  setError(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  mode === tab
                    ? "bg-primary text-white shadow-lg shadow-primary/25"
                    : "text-white/40 hover:text-white"
                }`}
              >
                {tab === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* Success message */}
          <AnimatePresence>
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3"
              >
                {successMessage}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-2xl px-4 py-3"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full name field (signup only) */}
            <AnimatePresence>
              {mode === "signup" && (
                <motion.label
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="block overflow-hidden"
                >
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-2 block">
                    Full Name
                  </span>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/30 py-3.5 pl-11 pr-4 text-white placeholder:text-white/20 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
                      placeholder="Your name"
                    />
                  </div>
                </motion.label>
              )}
            </AnimatePresence>

            {/* Email */}
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-2 block">
                Email
              </span>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 py-3.5 pl-11 pr-4 text-white placeholder:text-white/20 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
                  placeholder="you@studio.com"
                />
              </div>
            </label>

            {/* Password */}
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-2 block">
                Password
              </span>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 py-3.5 pl-11 pr-12 text-white placeholder:text-white/20 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
                  placeholder="Minimum 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>

            {/* Submit button */}
            <motion.button
              type="submit"
              disabled={submitting}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-600/90 text-white font-bold text-sm tracking-wide shadow-lg shadow-primary/25 flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {mode === "signin" ? "Sign In to Workspace" : "Create Account"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>
          </form>

          {/* Footer text */}
          {mode === "signin" && (
            <p className="mt-5 text-center text-xs text-white/30">
              Don&apos;t have an account?{" "}
              <button
                onClick={() => { setMode("signup"); setError(null); }}
                className="text-primary hover:text-primary/80 font-semibold transition-colors"
              >
                Sign up free
              </button>
            </p>
          )}
          {mode === "signup" && (
            <p className="mt-5 text-center text-xs text-white/30">
              Already have an account?{" "}
              <button
                onClick={() => { setMode("signin"); setError(null); }}
                className="text-primary hover:text-primary/80 font-semibold transition-colors"
              >
                Sign in
              </button>
            </p>
          )}
        </div>

        {/* Terms */}
        <p className="mt-6 text-center text-xs text-white/20">
          By continuing, you agree to Excerpt's Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}
