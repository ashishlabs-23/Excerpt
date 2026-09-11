'use client';

import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Wand2, Type, Maximize, Share2, Download, Loader2,
  Sparkles, Crop, Zap, TrendingUp, Clock, LayoutTemplate,
  Sliders, Image, FileCheck, Eye, Smartphone, RotateCcw
} from 'lucide-react';

export interface ExportOptions {
  aspectRatio: '9:16' | '1:1' | '16:9';
  quality: 'high' | 'medium';
  format: 'mp4';
}

interface EditorSidebarProps {
  captionsEnabled: boolean;
  onToggleCaptions: (enabled: boolean) => void;
  faceCenteringEnabled: boolean;
  onToggleFaceCentering: (enabled: boolean) => void;
  bRollEnabled: boolean;
  onToggleBRoll: (enabled: boolean) => void;
  onExport: (opts: ExportOptions) => void;
  isExporting: boolean;
  clipMeta?: {
    title?: string;
    duration?: number;
    viralityScore?: number;
    intent?: string;
  };
  // Studio properties
  captionStyle: string;
  onChangeCaptionStyle: (style: string) => void;
  captionFontSize?: number;
  onChangeCaptionFontSize?: (size: number) => void;
  captionPosition?: 'bottom' | 'middle' | 'top';
  onChangeCaptionPosition?: (pos: 'bottom' | 'middle' | 'top') => void;
  captionColor?: string;
  onChangeCaptionColor?: (color: string) => void;
  cropOffset: number;
  onChangeCropOffset: (offset: number) => void;
  thumbnailTime: number | null;
  onSelectThumbnailTime: () => void;
  thumbnailTitle: string;
  onChangeThumbnailTitle: (title: string) => void;
  readinessScore: number;
  socialPreviewMode: 'tiktok' | 'youtube' | 'instagram';
  onChangeSocialPreviewMode: (mode: 'tiktok' | 'youtube' | 'instagram') => void;
  aspectRatio?: ExportOptions['aspectRatio'];
  onChangeAspectRatio?: (aspect: ExportOptions['aspectRatio']) => void;
}

const ASPECT_RATIOS: { label: string; value: ExportOptions['aspectRatio']; desc: string; icon: string }[] = [
  { label: '9:16', value: '9:16', desc: 'TikTok / Reels', icon: '📱' },
  { label: '1:1', value: '1:1', desc: 'Feed Post', icon: '⬛' },
  { label: '16:9', value: '16:9', desc: 'YouTube', icon: '🖥️' },
];

const CAPTION_THEMES = [
  { id: 'Submagic', name: 'Submagic', desc: 'Bold, pink accents & emojis', style: 'text-[#ec4899] font-black' },
  { id: 'TikTok', name: 'TikTok Style', desc: 'High contrast yellow stroke', style: 'text-[#facc15] font-black tracking-tight' },
  { id: 'Hormozi', name: 'Alex Hormozi', desc: 'Yellow italic pop & rotation', style: 'text-[#eab308] font-black italic' },
  { id: 'MrBeast', name: 'MrBeast Neon', desc: 'Neon green bold outline', style: 'text-[#22c55e] font-black uppercase' },
  { id: 'Minimal', name: 'Minimalist', desc: 'Clean, elegant, white subtitle', style: 'text-white font-medium' },
];

const ACCENT_COLORS = [
  { label: 'Pink', value: '#ec4899', bg: 'bg-[#ec4899]' },
  { label: 'Yellow', value: '#facc15', bg: 'bg-[#facc15]' },
  { label: 'Neon Green', value: '#22c55e', bg: 'bg-[#22c55e]' },
  { label: 'Cyan', value: '#06b6d4', bg: 'bg-[#06b6d4]' },
  { label: 'Sunset', value: '#f97316', bg: 'bg-[#f97316]' },
  { label: 'White', value: '#ffffff', bg: 'bg-white' },
];

export const EditorSidebar: React.FC<EditorSidebarProps> = ({
  captionsEnabled,
  onToggleCaptions,
  faceCenteringEnabled,
  onToggleFaceCentering,
  bRollEnabled,
  onToggleBRoll,
  onExport,
  isExporting,
  clipMeta,
  captionStyle,
  onChangeCaptionStyle,
  captionFontSize = 28,
  onChangeCaptionFontSize,
  captionPosition = 'bottom',
  onChangeCaptionPosition,
  captionColor,
  onChangeCaptionColor,
  cropOffset,
  onChangeCropOffset,
  thumbnailTime,
  onSelectThumbnailTime,
  thumbnailTitle,
  onChangeThumbnailTitle,
  readinessScore,
  socialPreviewMode,
  onChangeSocialPreviewMode,
  aspectRatio: controlledAspect = '9:16',
  onChangeAspectRatio,
}) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'captions' | 'crop' | 'publish'>('ai');
  const [internalAspect, setInternalAspect] = useState<ExportOptions['aspectRatio']>('9:16');
  const [quality, setQuality] = useState<ExportOptions['quality']>('high');

  const aspectRatio = controlledAspect || internalAspect;
  const setAspectRatio = (val: ExportOptions['aspectRatio']) => {
    setInternalAspect(val);
    if (onChangeAspectRatio) onChangeAspectRatio(val);
  };

  const handleExport = () => onExport({ aspectRatio, quality, format: 'mp4' });

  const formatDuration = (s?: number) => {
    if (!s) return '--';
    return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
  };

  return (
    <aside className="w-full h-full bg-[#0a0f1a] border-l border-[#1a2235] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1a2235] bg-[#0d1425]/80 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={14} className="text-primary" />
          <h2 className="text-sm font-black text-[#e0e5f6] uppercase tracking-widest">Clip Studio</h2>
        </div>
        <p className="text-[9px] text-[#4b5563] uppercase tracking-widest">Production-Grade Video Suite</p>
      </div>

      {/* Tab Selectors */}
      <div className="grid grid-cols-4 border-b border-[#1a2235] bg-[#0d1425]/40 p-1 gap-1 shrink-0">
        {(['ai', 'captions', 'crop', 'publish'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-2 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all ${
              activeTab === tab
                ? 'bg-primary/10 text-primary border border-primary/20 shadow-md'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5 border border-transparent'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="flex-grow overflow-y-auto custom-scrollbar px-6 py-5 space-y-6">
        {activeTab === 'ai' && (
          <div className="space-y-6">
            {/* Metadata */}
            {clipMeta && (
              <div className="p-4 rounded-2xl bg-[#111827] border border-[#1f2937] space-y-3">
                <p className="text-sm font-bold text-[#e0e5f6] truncate">{clipMeta.title}</p>
                <div className="grid grid-cols-2 gap-2">
                  {clipMeta.duration !== undefined && (
                    <div className="flex items-center gap-2">
                      <Clock size={10} className="text-[#4b5563]" />
                      <span className="text-[10px] text-[#6b7280] font-bold">{formatDuration(clipMeta.duration)}</span>
                    </div>
                  )}
                  {clipMeta.viralityScore !== undefined && (
                    <div className="flex items-center gap-2">
                      <TrendingUp size={10} className="text-primary" />
                      <span className="text-[10px] text-primary font-bold">{clipMeta.viralityScore}% viral</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI Settings */}
            <div className="space-y-5">
              <div className="text-[9px] text-[#374151] font-black uppercase tracking-[0.2em]">AI Refinement</div>
              
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#1a2235] text-primary">
                    <Type size={15} />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-[#e0e5f6] block">Captions Overlay</span>
                    <span className="text-[9px] text-[#4b5563] block">Word-highlight style subtitle</span>
                  </div>
                </div>
                <Switch checked={captionsEnabled} onCheckedChange={onToggleCaptions} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#1a2235] text-emerald-400">
                    <Maximize size={15} />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-[#e0e5f6] block">Face Tracking</span>
                    <span className="text-[9px] text-[#4b5563] block">Maintains speaker frame auto-centering</span>
                  </div>
                </div>
                <Switch checked={faceCenteringEnabled} onCheckedChange={onToggleFaceCentering} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#1a2235] text-pink-400">
                    <Wand2 size={15} />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-[#e0e5f6] block">Context B-Roll</span>
                    <span className="text-[9px] text-[#4b5563] block">Auto insert footage hooks</span>
                  </div>
                </div>
                <Switch checked={bRollEnabled} onCheckedChange={onToggleBRoll} />
              </div>
            </div>

            {/* Aspect ratios */}
            <div className="space-y-3">
              <div className="text-[9px] text-[#374151] font-black uppercase tracking-[0.2em]">Aspect Ratio</div>
              <div className="grid grid-cols-3 gap-2">
                {ASPECT_RATIOS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setAspectRatio(r.value)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center transition-all ${
                      aspectRatio === r.value
                        ? 'bg-primary/10 border-primary/50 text-primary'
                        : 'bg-[#111827] border-[#1f2937] text-[#6b7280] hover:border-[#374151]'
                    }`}
                  >
                    <span className="text-base leading-none">{r.icon}</span>
                    <span className="text-[10px] font-black">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'captions' && (
          <div className="space-y-6">
            {/* Master Caption Toggle */}
            <div className="p-4 rounded-2xl bg-[#111827] border border-[#1f2937] space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${captionsEnabled ? 'bg-primary/20 text-primary' : 'bg-white/5 text-white/40'}`}>
                    <Type size={16} />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-[#e0e5f6] block">
                      {captionsEnabled ? 'Captions Active' : 'Captions Removed'}
                    </span>
                    <span className="text-[10px] text-[#9ca3af] block">
                      {captionsEnabled ? 'Animated text overlaid on video' : 'Clean video without captions'}
                    </span>
                  </div>
                </div>
                <Switch checked={captionsEnabled} onCheckedChange={onToggleCaptions} />
              </div>

              <div className="flex gap-2 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => onToggleCaptions(false)}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                    !captionsEnabled
                      ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                      : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  Remove Captions
                </button>
                <button
                  type="button"
                  onClick={() => onToggleCaptions(true)}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                    captionsEnabled
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  Add Captions
                </button>
              </div>
            </div>

            {captionsEnabled ? (
              <>
                <div className="text-[9px] text-[#374151] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                  <Type size={11} />
                  Choose Caption Style
                </div>

                <div className="space-y-3">
                  {CAPTION_THEMES.map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => onChangeCaptionStyle(theme.id)}
                      className={`w-full p-4 rounded-xl border text-left flex items-center justify-between transition-all ${
                        captionStyle === theme.id
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'bg-[#111827] border-[#1f2937] text-white/70 hover:border-[#374151]'
                      }`}
                    >
                      <div>
                        <span className="text-xs font-bold block">{theme.name}</span>
                        <span className="text-[9px] text-white/30 block mt-0.5">{theme.desc}</span>
                      </div>
                      <span className={`text-sm font-bold uppercase ${theme.style}`}>Style</span>
                    </button>
                  ))}
                </div>

                {/* Caption Position */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <span className="text-[9px] text-[#4b5563] font-black uppercase tracking-wider block">Position on Screen</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(['top', 'middle', 'bottom'] as const).map(pos => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => onChangeCaptionPosition && onChangeCaptionPosition(pos)}
                        className={`py-1.5 rounded-lg border text-center text-xs font-bold capitalize transition-all ${
                          captionPosition === pos
                            ? 'bg-primary/20 border-primary/50 text-white shadow-sm'
                            : 'bg-[#111827] border-[#1f2937] text-white/50 hover:border-[#374151]'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Caption Font Size */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <div className="flex justify-between text-[10px] text-white/40 font-bold">
                    <span>Text Size</span>
                    <span className="text-white font-mono">{captionFontSize}px</span>
                  </div>
                  <Slider
                    min={18}
                    max={44}
                    step={2}
                    value={[captionFontSize]}
                    onValueChange={(vals) => onChangeCaptionFontSize && onChangeCaptionFontSize(vals[0])}
                    className="accent-primary"
                  />
                </div>

                {/* Highlight Accent Color */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <div className="flex justify-between text-[10px] text-white/40 font-bold">
                    <span>Highlight Color</span>
                    {captionColor && (
                      <button
                        type="button"
                        onClick={() => onChangeCaptionColor && onChangeCaptionColor('')}
                        className="text-[9px] text-primary hover:underline"
                      >
                        Default
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {ACCENT_COLORS.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => onChangeCaptionColor && onChangeCaptionColor(c.value)}
                        title={c.label}
                        className={`w-7 h-7 rounded-full ${c.bg} transition-all border-2 ${
                          captionColor === c.value
                            ? 'border-white scale-110 shadow-lg'
                            : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-2xl bg-[#111827]/40 border border-white/5 text-center space-y-2">
                <p className="text-xs font-medium text-white/50">Captions are currently turned off.</p>
                <p className="text-[11px] text-white/30">Your video will play clean and export without any text or burned subtitles.</p>
                <button
                  type="button"
                  onClick={() => onToggleCaptions(true)}
                  className="mt-2 text-xs font-bold text-primary hover:underline"
                >
                  + Add Captions Back
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'crop' && (
          <div className="space-y-6">
            {/* Viewport Cropper */}
            <div className="space-y-4">
              <div className="text-[9px] text-[#374151] font-black uppercase tracking-[0.2em] flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Sliders size={11} />
                  Horizontal Framing
                </span>
                {cropOffset !== 0 && (
                  <button onClick={() => onChangeCropOffset(0)} className="text-[9px] text-primary font-bold flex items-center gap-0.5">
                    <RotateCcw size={8} /> Reset
                  </button>
                )}
              </div>

              <div className="p-4 rounded-xl bg-[#111827] border border-[#1f2937] space-y-4">
                <div className="flex justify-between text-[10px] text-white/40 font-bold">
                  <span>Left crop</span>
                  <span className="text-white font-mono">{cropOffset > 0 ? `+${cropOffset}` : cropOffset}%</span>
                  <span>Right crop</span>
                </div>
                <Slider
                  min={-50}
                  max={50}
                  step={1}
                  value={[cropOffset]}
                  onValueChange={(vals) => onChangeCropOffset(vals[0])}
                  className="accent-primary"
                />
                <p className="text-[9px] text-white/20 leading-relaxed text-center">
                  Drag the slider to manually shift the active video window horizontally over the speaker.
                </p>
              </div>
            </div>

            {/* Thumbnail selector */}
            <div className="space-y-4">
              <div className="text-[9px] text-[#374151] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                <Image size={11} />
                Thumbnail Studio
              </div>

              <div className="p-4 rounded-xl bg-[#111827] border border-[#1f2937] space-y-3">
                <Button
                  onClick={onSelectThumbnailTime}
                  variant="outline"
                  className="w-full border-white/10 text-white bg-white/5 hover:bg-white/10 text-xs font-bold"
                >
                  Capture Current Frame
                </Button>
                {thumbnailTime !== null && (
                  <div className="text-[9px] text-emerald-400 font-bold text-center">
                    ✓ Frame captured at {thumbnailTime.toFixed(2)}s
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[9px] text-white/40 font-bold uppercase tracking-wider block">Cover Text Overlay</label>
                  <input
                    type="text"
                    placeholder="Enter thumbnail hook text..."
                    value={thumbnailTitle}
                    onChange={(e) => onChangeThumbnailTitle(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-white/5 border border-white/5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'publish' && (
          <div className="space-y-6">
            {/* Readiness Checklist */}
            <div className="space-y-3">
              <div className="text-[9px] text-[#374151] font-black uppercase tracking-[0.2em] flex items-center justify-between">
                <span>Publishing Readiness</span>
                <span className="text-xs font-bold text-emerald-400">{readinessScore}%</span>
              </div>

              <div className="p-4 rounded-xl bg-[#111827] border border-[#1f2937] space-y-2.5">
                <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${readinessScore}%` }}
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2 text-xs">
                    <FileCheck size={14} className={clipMeta?.title ? "text-emerald-400" : "text-white/20"} />
                    <span className={clipMeta?.title ? "text-white" : "text-white/40"}>Context Title Set</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <FileCheck size={14} className={captionsEnabled ? "text-emerald-400" : "text-white/20"} />
                    <span className={captionsEnabled ? "text-white" : "text-white/40"}>Subtitles Styled & Styled</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <FileCheck size={14} className={thumbnailTime !== null ? "text-emerald-400" : "text-white/20"} />
                    <span className={thumbnailTime !== null ? "text-white" : "text-white/40"}>Thumbnail Frame Selected</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <FileCheck size={14} className={thumbnailTitle ? "text-emerald-400" : "text-white/20"} />
                    <span className={thumbnailTitle ? "text-white" : "text-white/40"}>Hook Text Overlay Set</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Social Overlays preview selector */}
            <div className="space-y-3">
              <div className="text-[9px] text-[#374151] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                <Eye size={11} />
                Device Simulation Mode
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(['tiktok', 'youtube', 'instagram'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => onChangeSocialPreviewMode(mode)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-center transition-all ${
                      socialPreviewMode === mode
                        ? 'bg-primary/10 border-primary/50 text-primary'
                        : 'bg-[#111827] border-[#1f2937] text-[#6b7280] hover:border-[#374151]'
                    }`}
                  >
                    <Smartphone size={14} />
                    <span className="text-[9px] font-bold capitalize">{mode}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Export Footer */}
      <div className="px-6 py-5 border-t border-[#1a2235] space-y-3 bg-[#0d1425]/80 shrink-0">
        <Button
          onClick={handleExport}
          disabled={isExporting}
          className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-white flex items-center justify-center gap-3 font-black text-[10px] tracking-widest uppercase shadow-lg shadow-primary/20 transition-all active:scale-95"
        >
          {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {isExporting ? 'Preparing Download...' : `Export ${aspectRatio} · ${quality === 'high' ? '1080p' : '720p'}`}
        </Button>
        {isExporting && (
          <p className="text-[10px] text-center text-primary/80 animate-pulse font-semibold">
            Rendering cuts & subtitles — download will start automatically...
          </p>
        )}

        <Button
          variant="outline"
          className="w-full h-10 rounded-2xl border-[#1a2235] text-[#6b7280] hover:text-white hover:bg-white/5 hover:border-white/10 flex items-center justify-center gap-2 font-black text-[9px] tracking-widest uppercase transition-all"
        >
          <Share2 size={14} />
          Publish Instantly
        </Button>
      </div>
    </aside>
  );
};
