"use client";

import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Magnetic,
} from "@/components/animations";
import { Sparkles, ArrowRight, Play, Zap, Shield, Target, Upload, Scissors, Wand2, Link as LinkIcon, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export const Hero: React.FC = () => {
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState("");
  const router = useRouter();

  const handleGetClips = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please paste a video URL first.");
      return;
    }
    try {
      new URL(trimmed);
      setError("");
      router.push(`/dashboard?import_url=${encodeURIComponent(trimmed)}`);
    } catch {
      setError("Please enter a valid URL (including http:// or https://).");
    }
  };

  const signalStats = [
    { label: "Input Modes", value: "URL + Upload" },
    { label: "Outputs", value: "Vertical Clips" },
    { label: "Recovery", value: "Draft Mode Ready" },
  ];

  const signalFlow = [
    { icon: Upload, title: "Ingest", detail: "Drop a file or sync a YouTube URL." },
    { icon: Wand2, title: "Analyze", detail: "AI scoring when available, draft recovery when not." },
    { icon: Scissors, title: "Render", detail: "Export mobile-first clips with a single flow." },
  ];

  return (
    <section className="relative flex flex-col items-center justify-start min-h-[100svh] text-center px-4 sm:px-6 pt-28 sm:pt-32 lg:pt-36 pb-20 sm:pb-24 lg:pb-28 overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-[18%] left-[12%] w-[260px] h-[260px] sm:w-[420px] sm:h-[420px] lg:w-[500px] lg:h-[500px] bg-primary/20 blur-[90px] sm:blur-[110px] lg:blur-[120px] rounded-full animate-pulse pointer-events-none" />
      <div className="absolute bottom-[12%] right-[10%] w-[220px] h-[220px] sm:w-[320px] sm:h-[320px] lg:w-[400px] lg:h-[400px] bg-purple-500/10 blur-[80px] sm:blur-[95px] lg:blur-[100px] rounded-full animate-bounce pointer-events-none" />
      
      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto w-full">
        {/* Badge */}
        <div>
          <div className="inline-flex max-w-full items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full glass-card border-primary/20 mb-8 sm:mb-10 group cursor-default">
            <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span className="text-[10px] sm:text-xs font-bold tracking-[0.22em] sm:tracking-widest uppercase text-primary/80 group-hover:text-primary transition-colors">
              Next-Gen AI Pipeline Active
            </span>
          </div>
        </div>

        {/* Main Title */}
        <div>
          <h1 className="text-[2.7rem] sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-bold tracking-tighter leading-[0.92] mb-6 sm:mb-8">
            <span className="block text-white">TRANSFORM</span>
            <span className="block">
              <span className="block sm:inline text-primary italic">CONTENT</span>
              <span className="block sm:inline-block sm:ml-4 text-white">TO CLIPS</span>
            </span>
          </h1>
        </div>

        {/* Subtitle */}
        <div>
          <p className="text-sm sm:text-lg md:text-xl text-white/65 mb-10 sm:mb-12 max-w-[20rem] sm:max-w-3xl mx-auto leading-relaxed font-light tracking-normal sm:tracking-wide px-1 sm:px-0">
            Automate your social presence with our elite AI engine. <br className="hidden md:block" />
            High-engagement clips, optimized for the speed of the internet.
          </p>
        </div>

        {/* Link Import Input Bar */}
        <div className="max-w-2xl mx-auto mb-10 px-4 relative z-20">
          <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-purple-500/30 rounded-2xl blur-lg opacity-30 group-focus-within:opacity-100 transition-opacity duration-500 -z-10" />
          <form onSubmit={handleGetClips} className="relative flex items-center p-1.5 rounded-2xl bg-slate-950/40 backdrop-blur-2xl border border-white/10 hover:border-white/20 focus-within:border-primary/50 focus-within:hover:border-primary/50 transition-all duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <div className="flex items-center pl-4 text-white/30">
              <LinkIcon size={18} />
            </div>
            <input
              type="text"
              placeholder="PASTE YOUTUBE OR DIRECT VIDEO LINK..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError("");
              }}
              className="w-full bg-transparent border-none outline-none py-3 px-4 text-xs font-bold tracking-wider text-white placeholder-white/20 focus:ring-0"
            />
            <Button
              type="submit"
              className="h-12 px-6 font-bold rounded-xl bg-primary hover:bg-primary/90 text-white hover:scale-102 active:scale-98 transition-all shrink-0 uppercase tracking-widest text-[10px]"
            >
              Get Clips
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </form>
          {error && (
            <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-rose-400 flex items-center gap-1.5 justify-center animate-pulse">
              <AlertCircle size={12} className="shrink-0" /> {error}
            </p>
          )}
        </div>

        {/* CTAs */}
        <div>
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-4 sm:gap-6 max-w-2xl mx-auto">
            <Magnetic strength={0.1}>
              <Link href="/dashboard">
                <Button className="w-full sm:w-auto h-14 sm:h-16 px-8 sm:px-10 text-base sm:text-lg font-bold rounded-2xl bg-primary hover:bg-primary/90 text-white shadow-2xl shadow-primary/30 animate-glow border border-white/10 group transition-all duration-500 hover:scale-105">
                  Launch Dashboard
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </Magnetic>

            <Link href="#how-it-works">
              <Button
                variant="outline"
                className="w-full sm:w-auto h-14 sm:h-16 px-8 sm:px-10 text-base sm:text-lg font-bold rounded-2xl border-white/10 glass-card bg-white/[0.02] hover:bg-white/[0.08] group transition-all duration-500"
              >
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center mr-3 group-hover:bg-primary/20 transition-colors">
                  <Play className="w-4 h-4 fill-white" />
                </div>
                See How It Works
              </Button>
            </Link>
          </div>
        </div>

        <div>
          <div className="mt-8 sm:mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-sm sm:max-w-3xl mx-auto">
            {signalStats.map((item) => (
              <div
                key={item.label}
                className="px-4 py-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl"
              >
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/30 mb-2">
                  {item.label}
                </p>
                <p className="text-sm font-semibold text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mt-10 sm:mt-12 grid grid-cols-1 lg:grid-cols-[1.3fr_0.9fr] gap-5 sm:gap-6 text-left">
            <div className="rounded-[28px] sm:rounded-[32px] border border-white/10 bg-white/[0.04] backdrop-blur-2xl p-5 sm:p-8 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,0.2),transparent_35%)] pointer-events-none" />
              <div className="relative z-10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/80 mb-2">
                      Signal Console
                    </p>
                    <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                      Built for creators who need clips, not clutter
                    </h3>
                  </div>
                  <div className="self-start px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-[0.25em]">
                    Ready
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  {signalFlow.map((item) => (
                    <div key={item.title} className="rounded-2xl border border-white/8 bg-black/20 p-5">
                      <item.icon className="w-5 h-5 text-primary mb-4" />
                      <p className="text-sm font-bold text-white mb-2">{item.title}</p>
                      <p className="text-xs text-white/40 leading-relaxed">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] sm:rounded-[32px] border border-white/10 bg-[#0a1120]/80 backdrop-blur-2xl p-5 sm:p-6 relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.18),transparent_40%)] pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/35">
                    Live Workflow
                  </p>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/30 mb-2">
                      Current Stack
                    </p>
                    <p className="text-white font-semibold leading-relaxed">
                      FFmpeg rendering, AI-assisted selection, resilient fallback clipping.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/30 mb-2">
                      Outcome
                    </p>
                    <p className="text-sm text-white/60 leading-relaxed">
                      Even when AI providers throttle, Excerpt can still draft clips so the workflow keeps moving.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features Preview */}
        <div>
          <div className="mt-16 sm:mt-24 lg:mt-28 grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-8 text-left">
            {[
              { icon: Zap, title: "Sonic Speed", desc: "Clips generated in under 120 seconds." },
              { icon: Target, title: "High Retention", desc: "AI optimized for viral engagement metrics." },
              { icon: Shield, title: "Elite Privacy", desc: "Your content, protected by enterprise encryption." }
            ].map((feat, i) => (
              <div key={i} className="p-6 sm:p-8 rounded-3xl glass-card border-white/5 hover:border-primary/30 group transition-all duration-500">
                <feat.icon className="w-10 h-10 text-primary mb-6 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold text-white mb-2 tracking-tight">{feat.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed tracking-wide">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Elements for Premium Feel */}
      <div className="absolute top-0 right-0 w-1/3 h-1/2 bg-gradient-to-b from-primary/5 to-transparent blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-0 left-0 w-1/4 h-1/3 bg-gradient-to-t from-purple-500/5 to-transparent blur-3xl pointer-events-none -z-10" />
    </section>
  );
};
