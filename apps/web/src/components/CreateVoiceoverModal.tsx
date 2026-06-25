"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, Loader2, Play, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { VoiceEnginePanel } from './VoiceEnginePanel';
import { authFetch } from '@/lib/api';

interface CreateVoiceoverModalProps {
  clip: any;
  onClose: () => void;
  onSuccess: () => void;
}

const STYLES = [
  { id: 'football_commentary', name: 'Football Commentary' },
  { id: 'viral_shorts', name: 'Viral Shorts' },
  { id: 'tactical_analysis', name: 'Tactical Analysis' },
  { id: 'documentary', name: 'Documentary' },
  { id: 'youtube_narrator', name: 'YouTube Narrator' },
  { id: 'custom_prompt', name: 'Custom Persona' }
];

const LANGUAGES = [
  { id: 'English', name: 'English 🇺🇸' },
  { id: 'Hindi', name: 'Hindi 🇮🇳' },
  { id: 'Kannada', name: 'Kannada 🇮🇳' },
  { id: 'Spanish', name: 'Spanish 🇪🇸' },
  { id: 'Portuguese', name: 'Portuguese 🇧🇷' }
];

export const CreateVoiceoverModal: React.FC<CreateVoiceoverModalProps> = ({ clip, onClose, onSuccess }) => {
  // Step 1: Voice Config
  const [voiceConfig, setVoiceConfig] = useState<any>({ provider: 'google', speakingRate: 1.0 });
  
  // Step 2: Script Source
  const [scriptSource, setScriptSource] = useState<'transcript' | 'ai_generated' | 'custom'>('custom');
  
  // Step 3: Style & Language & Custom Instruction
  const [style, setStyle] = useState('football_commentary');
  const [language, setLanguage] = useState('English');
  const [customInstruction, setCustomInstruction] = useState('');
  
  // Step 5: Narration Script
  const [narrationText, setNarrationText] = useState('');
  
  const [generating, setGenerating] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  // Initialize script text depending on scriptSource selection
  useEffect(() => {
    if (scriptSource === 'transcript') {
      setNarrationText(clip.content || clip.summary || '');
    } else if (scriptSource === 'custom' && !narrationText) {
      setNarrationText(clip.content || clip.summary || '');
    }
  }, [scriptSource, clip]);

  const handleGenerateScript = async () => {
    setIsGeneratingScript(true);
    try {
      const res = await authFetch('/api/voiceover/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style,
          language,
          contextText: clip.content || clip.summary || '',
          customInstruction: style === 'custom_prompt' ? customInstruction : undefined
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate AI script');
      }

      const data = await res.json();
      setNarrationText(data.script);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerate = async () => {
    if (!voiceConfig.voiceId) {
      alert('Please select a voice first.');
      return;
    }
    const cleanText = narrationText.trim();
    if (cleanText.length < 20) {
      alert('Narration script must be at least 20 characters.');
      return;
    }
    if (cleanText.length > 5000) {
      alert('Narration script cannot exceed 5000 characters.');
      return;
    }

    setGenerating(true);
    try {
      const res = await authFetch(`/api/voiceover/clip/${clip.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: voiceConfig.provider,
          voice: voiceConfig.voiceId,
          narrationText: cleanText,
          scriptMode: scriptSource
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create voiceover clip');
      }

      onSuccess();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
    >
      <div className="absolute inset-0" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-5xl max-h-[90vh] flex flex-col md:flex-row bg-[#050505] rounded-[32px] overflow-hidden border border-white/10 shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white"
        >
          <X size={16} />
        </button>

        {/* Left Side: Voice Engine Panel */}
        <div className="w-full md:w-1/2 flex flex-col border-r border-white/10 overflow-hidden">
          <div className="h-full overflow-y-auto">
             <VoiceEnginePanel voiceConfig={voiceConfig} onChange={setVoiceConfig} />
          </div>
        </div>

        {/* Right Side: Narration, Script Source, Customization & Generation */}
        <div className="w-full md:w-1/2 flex flex-col p-6 space-y-6 overflow-y-auto custom-scrollbar">
          <div>
            <h3 className="text-xl font-bold text-white mb-2">Configure Voiceover</h3>
            <p className="text-sm text-white/50">
              Transform the clip using AI script styling and premium voiceover providers.
            </p>
          </div>

          {/* Step 2: Script Source Selection */}
          <div className="space-y-3">
            <span className="text-xs font-bold text-white/60 uppercase tracking-widest block">Script Source</span>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                <input
                  type="radio"
                  name="scriptSource"
                  checked={scriptSource === 'transcript'}
                  onChange={() => setScriptSource('transcript')}
                  className="accent-primary"
                />
                Original Transcript
              </label>
              <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                <input
                  type="radio"
                  name="scriptSource"
                  checked={scriptSource === 'ai_generated'}
                  onChange={() => setScriptSource('ai_generated')}
                  className="accent-primary"
                />
                AI Generated
              </label>
              <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                <input
                  type="radio"
                  name="scriptSource"
                  checked={scriptSource === 'custom'}
                  onChange={() => setScriptSource('custom')}
                  className="accent-primary"
                />
                Custom Script
              </label>
            </div>
          </div>

          {/* Step 3: AI Style and Language Parameters (If AI Generated is selected) */}
          {scriptSource === 'ai_generated' && (
            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Style</label>
                  <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    className="w-full h-10 bg-black/60 border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary/50"
                  >
                    {STYLES.map(s => (
                      <option key={s.id} value={s.id} className="bg-slate-950">{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full h-10 bg-black/60 border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary/50"
                  >
                    {LANGUAGES.map(l => (
                      <option key={l.id} value={l.id} className="bg-slate-950">{l.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {style === 'custom_prompt' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Persona / Custom Prompt</label>
                  <input
                    type="text"
                    placeholder="e.g. Act like Peter Drury"
                    value={customInstruction}
                    onChange={(e) => setCustomInstruction(e.target.value)}
                    className="w-full h-10 bg-black/60 border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-primary/50"
                  />
                </div>
              )}

              {/* Step 4: Generate AI Script Buttons */}
              <Button
                onClick={handleGenerateScript}
                disabled={isGeneratingScript}
                variant="outline"
                className="w-full h-10 text-xs uppercase tracking-wider flex items-center justify-center gap-2 border-white/10"
              >
                {isGeneratingScript ? <Loader2 size={12} className="animate-spin" /> : narrationText ? <RefreshCw size={12} /> : <Sparkles size={12} />}
                {isGeneratingScript ? 'Writing Script...' : narrationText ? 'Regenerate Script' : 'Auto Generate Script'}
              </Button>
            </div>
          )}

          {/* Step 5: Always Show Editable Textarea */}
          <div className="space-y-2 flex-grow flex flex-col">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-white/60 uppercase tracking-widest">Narration Script</label>
              <span className="text-[10px] text-white/30 font-mono">
                {narrationText.length} / 5000 chars
              </span>
            </div>
            <textarea
              className="w-full min-h-[160px] bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:border-primary/50 resize-none flex-grow"
              value={narrationText}
              onChange={(e) => setNarrationText(e.target.value)}
              placeholder="Script content here..."
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating || isGeneratingScript}
            className="w-full h-14 rounded-xl bg-primary hover:bg-primary/80 text-white font-bold tracking-widest uppercase shadow-lg shadow-primary/20"
          >
            {generating ? <Loader2 className="animate-spin mr-2" /> : <Mic className="mr-2" />}
            {generating ? 'Queuing Voiceover...' : 'Generate Voiceover Clip'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
};
