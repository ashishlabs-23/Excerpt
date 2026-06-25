"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Sparkles,
  Loader2,
  CheckCircle2,
  X,
  Zap,
  Rocket,
  BookOpen,
  Lightbulb,
  Swords,
  ArrowRight,
  Film,
  Link2,
} from "lucide-react";
import { apiUrl, authFetch, authHeaders } from "@/lib/api";

interface UploadZoneProps {
  onUploadComplete: (jobId: string) => void;
  initialUrl?: string;
}

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getFriendlyErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "We couldn't start processing.";
  if (/valid video url|valid youtube url/i.test(message))
    return "Please paste a valid public video URL.";
  if (/only video uploads/i.test(message)) return "Please choose a video file.";
  if (/network|fetch|connection/i.test(message))
    return "Pipeline unreachable. Please try again.";
  return message;
}

const INTENT_OPTIONS = [
  { id: "viral", label: "Viral", icon: Rocket, desc: "High hook moments" },
  { id: "storyteller", label: "Story", icon: BookOpen, desc: "Sequential narrative" },
  { id: "educational", label: "Insights", icon: Lightbulb, desc: "Podcasts & talks" },
  { id: "action", label: "Action", icon: Swords, desc: "Sports & gaming" },
  { id: "discovery", label: "Discovery", icon: Film, desc: "Explore new zones" },
] as const;

type Intent = typeof INTENT_OPTIONS[number]["id"];

export const UploadZone: React.FC<UploadZoneProps> = ({ onUploadComplete, initialUrl }) => {
  const [url, setUrl] = useState(initialUrl || "");
  const [isLoading, setIsLoading] = useState(false);
  const [numClips, setNumClips] = useState(3);
  const [intent, setIntent] = useState<Intent>("viral");
  const [avoidSimilarClips, setAvoidSimilarClips] = useState<'strict' | 'balanced' | 'explore'>("balanced");
  const [generationMode, setGenerationMode] = useState<'draft' | 'quality'>("draft");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    progress: number;
    message: string;
    type?: "uploading" | "success" | "error";
  } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [estimatedClips, setEstimatedClips] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRequestRef = useRef<"url" | "file" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialUrl) setUrl(initialUrl);
  }, [initialUrl]);

  const fetchEstimation = useCallback(async (videoUrl: string) => {
    if (!isValidHttpUrl(videoUrl)) return;
    setIsEstimating(true);
    try {
      const response = await authFetch("/api/video/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl }),
      });
      const data = await response.json();
      if (data.estimate) {
        setEstimatedClips(data.estimate);
        setNumClips(Math.min(data.estimate, 5));
      }
    } catch {}
    finally { setIsEstimating(false); }
  }, []);

  useEffect(() => {
    if (!url || !isValidHttpUrl(url)) { setEstimatedClips(null); return; }
    const timer = window.setTimeout(() => fetchEstimation(url), 700);
    return () => window.clearTimeout(timer);
  }, [fetchEstimation, url]);

  const handleUrlSubmit = async () => {
    const trimmedUrl = url.trim();
    if (isLoading || activeRequestRef.current) return;
    if (!trimmedUrl || !isValidHttpUrl(trimmedUrl)) {
      setUploadStatus({ progress: 0, message: "Please enter a valid video URL.", type: "error" });
      return;
    }
    activeRequestRef.current = "url";
    setIsLoading(true);
    setUploadStatus({ progress: 5, message: "Connecting to source…", type: "uploading" });
    try {
      const response = await authFetch("/api/video/generate-clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: trimmedUrl, numClips, intent, avoidSimilarClips, generationMode }),
      });
      const data = await response.json();
      if (!response.ok) {
        const errorMsg = data.errors
          ? data.errors.map((e: any) => e.msg).join(", ")
          : data.error || `Error ${response.status}`;
        throw new Error(errorMsg);
      }
      if (data.jobId) {
        setUploadStatus({ progress: 100, message: "Clip generation started!", type: "success" });
        setTimeout(() => { onUploadComplete(data.jobId); }, 800);
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error: any) {
      setUploadStatus({ progress: 0, message: getFriendlyErrorMessage(error), type: "error" });
    } finally {
      setIsLoading(false);
      activeRequestRef.current = null;
    }
  };

  const handleFileUpload = useCallback(async (file: File) => {
    if (isLoading || activeRequestRef.current) return;
    if (!file.type.startsWith("video/")) {
      setUploadStatus({ progress: 0, message: "Please upload a valid video file.", type: "error" });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadStatus({ progress: 0, message: "File exceeds the 2GB limit.", type: "error" });
      return;
    }
    activeRequestRef.current = "file";
    setIsLoading(true);
    setUploadStatus({ progress: 0, message: "Uploading video…", type: "uploading" });
    const formData = new FormData();
    formData.append("video", file);
    formData.append("numClips", numClips.toString());
    formData.append("intent", intent);
    formData.append("avoidSimilarClips", avoidSimilarClips);
    formData.append("generationMode", generationMode);
    const xhr = new XMLHttpRequest();
    try {
      const headers = await authHeaders();
      const uploadPromise = new Promise<{ jobId: string; error?: string }>((resolve, reject) => {
        xhr.open("POST", apiUrl("/api/video/upload"), true);
        headers.forEach((value, key) => {
          xhr.setRequestHeader(key, value);
        });
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadStatus((prev) => prev ? { ...prev, progress: Math.min(pct, 99) } : null);
          }
        });
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(data);
            else reject(new Error(data.error || "Upload failed"));
          } catch { reject(new Error("Failed to parse response")); }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(formData);
      });
      const data = await uploadPromise;
      if (data.jobId) {
        setUploadStatus({ progress: 100, message: "Video uploaded!", type: "success" });
        setTimeout(() => { onUploadComplete(data.jobId); setUploadStatus(null); }, 1000);
      } else {
        throw new Error(data.error || "Import failed");
      }
    } catch (error: any) {
      setUploadStatus({ progress: 0, message: getFriendlyErrorMessage(error), type: "error" });
    } finally {
      setIsLoading(false);
      activeRequestRef.current = null;
    }
  }, [intent, isLoading, numClips, avoidSimilarClips, generationMode, onUploadComplete]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isLoading || activeRequestRef.current) return;
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("video/")) handleFileUpload(file);
  }, [handleFileUpload, isLoading]);

  const isUrlValid = isValidHttpUrl(url.trim());

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="w-full mb-12"
    >
      {/* ── Hero Text ── */}
      <div className="text-center mb-8">
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tighter text-white mb-3"
        >
          Turn any video into{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#C87740] to-[#E5A16F]">
            viral clips
          </span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-sm text-white/40 font-medium"
        >
          Paste a YouTube, TikTok, or video URL — AI does the rest
        </motion.p>
      </div>

      {/* ── Main Input Card ── */}
      <div className="max-w-3xl mx-auto">
        <div className="relative bg-white/[0.03] border border-white/10 rounded-2xl p-1.5 shadow-[0_0_80px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          {/* Glow ring when valid URL */}
          {isUrlValid && (
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#C87740]/20 to-transparent pointer-events-none" />
          )}

          <div className="flex items-center gap-2">
            {/* URL Icon */}
            <div className="flex-shrink-0 pl-3">
              {isEstimating ? (
                <Loader2 className="text-primary/60 animate-spin" size={18} />
              ) : isUrlValid ? (
                <CheckCircle2 className="text-emerald-400" size={18} />
              ) : (
                <Link2 className="text-white/20" size={18} />
              )}
            </div>

            {/* Input */}
            <input
              ref={inputRef}
              type="url"
              placeholder="Paste YouTube, TikTok, or video URL here…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
              disabled={isLoading}
              className="flex-1 bg-transparent py-4 text-sm sm:text-base text-white placeholder-white/25 focus:outline-none font-medium"
            />

            {/* Clear */}
            {url && !isLoading && (
              <button
                onClick={() => { setUrl(""); setEstimatedClips(null); inputRef.current?.focus(); }}
                className="flex-shrink-0 p-2 text-white/20 hover:text-white/60 transition-colors"
              >
                <X size={16} />
              </button>
            )}

            {/* CTA Button */}
            <button
              onClick={handleUrlSubmit}
              disabled={isLoading || !isUrlValid}
              className={`flex-shrink-0 flex items-center gap-2 px-5 py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all duration-300 ${
                isUrlValid && !isLoading
                  ? "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]"
                  : "bg-white/5 text-white/20 cursor-not-allowed"
              }`}
            >
              {isLoading ? (
                <><Loader2 size={16} className="animate-spin" /><span className="hidden sm:block">Generating…</span></>
              ) : (
                <><Sparkles size={16} /><span className="hidden sm:block">Generate Clips</span><ArrowRight size={16} className="sm:hidden" /></>
              )}
            </button>
          </div>
        </div>

        {/* ── Status / Progress ── */}
        <AnimatePresence>
          {uploadStatus && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mt-3"
            >
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
                uploadStatus.type === "error"
                  ? "bg-red-500/10 border border-red-500/20 text-red-400"
                  : uploadStatus.type === "success"
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  : "bg-primary/10 border border-primary/20 text-primary"
              }`}>
                {uploadStatus.type === "error" ? (
                  <X size={16} />
                ) : uploadStatus.type === "success" ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <Loader2 size={16} className="animate-spin" />
                )}
                <span>{uploadStatus.message}</span>
                {uploadStatus.type === "uploading" && (
                  <span className="ml-auto text-xs opacity-60">{Math.round(uploadStatus.progress)}%</span>
                )}
              </div>
              {uploadStatus.type === "uploading" && (
                <div className="mt-1.5 h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadStatus.progress}%` }}
                    transition={{ type: "spring", bounce: 0 }}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── AI Estimation Badge ── */}
        <AnimatePresence>
          {estimatedClips && !isLoading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center justify-center gap-2 mt-4"
            >
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                <Zap size={12} className="text-primary" />
                <span className="text-[11px] font-bold text-primary/80">
                  AI estimates {estimatedClips} clip{estimatedClips !== 1 ? "s" : ""} from this video
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Redesigned Unified Cyber Options Grid ── */}
        <div className="mt-8 space-y-6">
          {/* Main Card Wrapper */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl p-6 sm:p-8 relative overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.6)]">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />

            <div className="space-y-8">
              {/* Row 1: Intent Style Selector */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles size={14} className="text-primary" />
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/40">
                    AI Target Style & Intent Model
                  </span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {INTENT_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isActive = intent === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setIntent(opt.id)}
                        className={`flex items-center gap-3 p-4 rounded-2xl border text-left transition-all duration-300 relative overflow-hidden group/opt ${
                          isActive
                            ? "border-primary bg-primary/[0.05] shadow-[0_0_20px_rgba(200,119,64,0.15)]"
                            : "border-white/5 bg-black/20 hover:border-white/15 hover:bg-black/35"
                        }`}
                      >
                        <div className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                          isActive ? "bg-primary/20 text-primary" : "bg-white/5 text-white/40 group-hover/opt:text-white"
                        }`}>
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-black text-white uppercase italic tracking-wider block">
                            {opt.label}
                          </span>
                          <span className="text-[9px] text-white/30 truncate block mt-0.5">
                            {opt.desc}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/5" />

              {/* Toggle Switch for Draft vs Quality Mode */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl border border-white/5 bg-black/20">
                <div>
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.25em] block mb-1">
                    Processing Mode
                  </span>
                  <p className="text-xs text-white/50 leading-relaxed max-w-lg">
                    Choose <strong>⚡ Draft Mode (1-2 min)</strong> for rapid turnaround, or <strong>🏆 Quality Mode (3-5 min)</strong> for maximum context analysis, smart cropping, and custom templates.
                  </p>
                </div>
                <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/5 shrink-0 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={() => !isLoading && setGenerationMode('draft')}
                    disabled={isLoading}
                    className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                      generationMode === 'draft'
                        ? "bg-primary text-white shadow-md shadow-primary/25"
                        : "text-white/45 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Zap size={12} />
                    Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => !isLoading && setGenerationMode('quality')}
                    disabled={isLoading}
                    className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                      generationMode === 'quality'
                        ? "bg-primary text-white shadow-md shadow-primary/25"
                        : "text-white/45 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Sparkles size={12} />
                    Quality
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/5" />

              {/* Row 2: Parameters and File Ingestion */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Column 1: Target Count */}
                <div className="flex flex-col justify-between p-5 rounded-2xl border border-white/5 bg-black/20">
                  <div className="mb-4">
                    <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] block mb-1">
                      Target Clip Count
                    </span>
                    <p className="text-[10px] text-white/45 font-medium leading-relaxed">Number of clips to extract</p>
                  </div>
                  <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5 w-full">
                    {[1, 2, 3, 4, 5].map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => !isLoading && setNumClips(count)}
                        disabled={isLoading}
                        className={`flex-1 h-9 rounded-lg text-xs font-black transition-all ${
                          numClips === count
                            ? "bg-primary text-white shadow-md shadow-primary/25"
                            : "text-white/45 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Column 2: Avoid Similar Clips */}
                <div className="flex flex-col justify-between p-5 rounded-2xl border border-white/5 bg-black/20">
                  <div className="mb-4">
                    <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] block mb-1">
                      Avoid Similar Clips
                    </span>
                    <p className="text-[10px] text-white/45 font-medium leading-relaxed">Exclusion similarity strictness</p>
                  </div>
                  <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5 w-full">
                    {[
                      { id: 'strict', label: 'Strict' },
                      { id: 'balanced', label: 'Balanced' },
                      { id: 'explore', label: 'Explore' }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => !isLoading && setAvoidSimilarClips(opt.id as any)}
                        disabled={isLoading}
                        className={`flex-1 h-9 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                          avoidSimilarClips === opt.id
                            ? "bg-primary text-white shadow-md shadow-primary/25"
                            : "text-white/45 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Column 3: Local Video Upload */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`flex flex-col justify-between p-5 rounded-2xl border transition-all duration-300 ${
                    isDragging
                      ? "border-primary bg-primary/[0.03] shadow-[0_0_20px_rgba(200,119,64,0.15)]"
                      : "bg-black/20 border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="mb-4">
                    <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] block mb-1">
                      Local Video Ingestion
                    </span>
                    <p className="text-[10px] text-white/45 font-medium leading-relaxed">Drop local MP4/MOV or click to upload</p>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => !isLoading && fileInputRef.current?.click()}
                    disabled={isLoading}
                    className={`w-full py-2 rounded-xl border text-[10px] font-black tracking-widest uppercase transition-all duration-300 flex items-center justify-center gap-2 ${
                      isDragging
                        ? "border-primary bg-primary text-white shadow-[0_0_10px_rgba(200,119,64,0.3)]"
                        : "border-white/10 text-white/50 hover:border-white/20 hover:text-white hover:bg-white/[0.04]"
                    }`}
                  >
                    <Film size={12} />
                    Upload File
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="video/*"
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    />
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ── Trust signals ── */}
        <div className="flex items-center justify-center gap-5 mt-8 text-[9px] font-bold text-white/15 uppercase tracking-[0.2em]">
          <span className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-pulse" />
            HD Quality
          </span>
          <span className="w-0.5 h-3 bg-white/10 rounded-full" />
          <span className="flex items-center gap-1.5">
            <Sparkles size={9} />
            Neural AI
          </span>
          <span className="w-0.5 h-3 bg-white/10 rounded-full" />
          <span className="flex items-center gap-1.5">
            <Upload size={9} />
            Up to 2GB
          </span>
        </div>
      </div>
    </motion.div>
  );
};
