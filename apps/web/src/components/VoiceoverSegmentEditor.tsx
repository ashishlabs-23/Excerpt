'use client';

import React, { useState } from 'react';
import { Plus, Trash2, Mic, Settings, Calendar, Play, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface VoiceoverSegment {
  id: string;
  start_time: number;
  end_time: number;
  narration_text: string;
  clip_type: 'narration' | 'intro' | 'outro' | 'transition';
}

interface Props {
  segments: VoiceoverSegment[];
  onChange: (segments: VoiceoverSegment[]) => void;
  duration: number;
}

export const VoiceoverSegmentEditor: React.FC<Props> = ({ segments, onChange, duration = 60 }) => {
  const [editingId, setEditingId] = useState<string | null>(null);

  const addSegment = () => {
    const newSeg: VoiceoverSegment = {
      id: crypto.randomUUID(),
      start_time: segments.length ? segments[segments.length - 1].end_time : 0,
      end_time: segments.length ? Math.min(segments[segments.length - 1].end_time + 5, duration) : Math.min(5, duration),
      narration_text: '',
      clip_type: 'narration',
    };
    onChange([...segments, newSeg]);
    setEditingId(newSeg.id);
  };

  const updateSegment = (id: string, updates: Partial<VoiceoverSegment>) => {
    onChange(segments.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeSegment = (id: string) => {
    onChange(segments.filter(s => s.id !== id));
    if (editingId === id) setEditingId(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#030712] rounded-3xl border border-white/10 overflow-hidden relative">
      <div className="p-6 border-b border-white/5 flex items-center justify-between z-10 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-[0_0_15px_rgba(200,119,64,0.15)]">
            <Layers size={20} />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg tracking-tight">Voice & Timeline Editor</h2>
            <p className="text-white/40 text-[11px] font-medium tracking-wider uppercase">Visual Multitrack Synchronization</p>
          </div>
        </div>
        <button
          onClick={addSegment}
          className="h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-white/80 font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-2"
        >
          <Plus size={14} /> Add Segment
        </button>
      </div>

      {/* Multitrack Timeline Preview */}
      <div className="px-6 py-4 bg-[#080d19]/60 border-b border-white/5 space-y-3 shrink-0">
        <div className="text-[9px] font-black text-white/40 uppercase tracking-widest">Studio Timeline Tracks</div>

        <div className="space-y-2.5">
          {/* Video track */}
          <div className="flex items-center gap-3">
            <span className="w-14 text-[9px] text-white/40 font-bold uppercase tracking-wider text-right">Video</span>
            <div className="flex-1 h-6 rounded-lg bg-white/5 border border-white/5 relative overflow-hidden flex items-center px-2">
              <div className="absolute left-[10%] w-[35%] h-full bg-emerald-500/10 border-x border-emerald-500/30 flex items-center px-2 text-[8px] text-emerald-400 font-bold uppercase">
                Action Hook
              </div>
              <div className="absolute left-[45%] w-[45%] h-full bg-indigo-500/10 border-x border-indigo-500/30 flex items-center px-2 text-[8px] text-indigo-400 font-bold uppercase">
                Tension Peak
              </div>
            </div>
          </div>

          {/* Voice track */}
          <div className="flex items-center gap-3">
            <span className="w-14 text-[9px] text-white/40 font-bold uppercase tracking-wider text-right">Voice</span>
            <div className="flex-1 h-6 rounded-lg bg-[#ef4444]/5 border border-[#ef4444]/15 relative overflow-hidden flex items-center justify-between px-2">
              {segments.map((seg, idx) => {
                const leftPct = (seg.start_time / (duration || 60)) * 100;
                const widthPct = ((seg.end_time - seg.start_time) / (duration || 60)) * 100;
                return (
                  <div
                    key={seg.id}
                    className="absolute h-full bg-gradient-to-r from-primary/30 to-orange-500/25 border-x border-primary/40 flex items-center justify-center text-[8px] text-white font-mono"
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  >
                    N#{idx+1}
                  </div>
                );
              })}
              {segments.length === 0 && (
                <span className="text-[8px] text-white/20 uppercase tracking-widest font-bold">No speech tracks generated</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 relative z-10 custom-scrollbar">
        <AnimatePresence>
          {segments.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50"
            >
              <Mic size={48} className="mb-4 opacity-20" />
              <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">No Voiceover Tracks</h3>
              <p className="text-xs text-white/40 max-w-sm">Use the Script Generator on the left or add segments manually to compose the timeline narration.</p>
            </motion.div>
          ) : (
            segments.map((seg, index) => (
              <motion.div
                key={seg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`p-5 rounded-2xl border transition-all ${
                  editingId === seg.id 
                    ? 'bg-primary/5 border-primary/30 shadow-[0_0_30px_rgba(200,119,64,0.1)]' 
                    : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.03]'
                }`}
                onClick={() => setEditingId(seg.id)}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/60">
                      {index + 1}
                    </span>
                    <select
                      value={seg.clip_type}
                      onChange={(e) => updateSegment(seg.id, { clip_type: e.target.value as any })}
                      className="bg-transparent border-none text-xs font-bold text-white/60 uppercase tracking-widest focus:outline-none focus:ring-0 cursor-pointer hover:text-white"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="intro" className="bg-[#030712]">Intro Hook</option>
                      <option value="narration" className="bg-[#030712]">Narration</option>
                      <option value="transition" className="bg-[#030712]">Transition</option>
                      <option value="outro" className="bg-[#030712]">Outro</option>
                    </select>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="number" 
                        value={seg.start_time} 
                        onChange={(e) => updateSegment(seg.id, { start_time: Number(e.target.value) })}
                        className="w-16 h-8 bg-black/40 border border-white/10 rounded-lg text-center text-xs text-white focus:border-primary/50 focus:outline-none"
                        step="0.1"
                      />
                      <span className="text-white/30 text-xs font-bold">TO</span>
                      <input 
                        type="number" 
                        value={seg.end_time} 
                        onChange={(e) => updateSegment(seg.id, { end_time: Number(e.target.value) })}
                        className="w-16 h-8 bg-black/40 border border-white/10 rounded-lg text-center text-xs text-white focus:border-primary/50 focus:outline-none"
                        step="0.1"
                      />
                    </div>
                    
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeSegment(seg.id); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    value={seg.narration_text}
                    onChange={(e) => updateSegment(seg.id, { narration_text: e.target.value })}
                    placeholder="Enter segment narration... (AI will polish this to sync with video triggers)"
                    className="w-full h-20 bg-black/20 border border-white/5 rounded-xl p-4 text-sm text-white/90 placeholder:text-white/20 focus:border-primary/30 focus:bg-black/40 focus:outline-none resize-none transition-all"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="absolute bottom-3 right-3 text-[10px] font-bold text-white/20">
                    {seg.narration_text.length} / 500
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
