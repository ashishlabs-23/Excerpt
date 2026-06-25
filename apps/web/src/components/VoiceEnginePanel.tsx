'use client';

import React, { useState, useEffect } from 'react';
import { Settings2, Volume2, FastForward, Mic, Upload, Plus, Check, Loader2, VolumeX, Sparkles } from 'lucide-react';
import { LocalVoiceConfig } from '@/app/voiceover/page';
import { VoiceRecorder } from './VoiceRecorder';
import { apiUrl, authFetch, authHeaders } from '@/lib/api';

interface Props {
  voiceConfig: LocalVoiceConfig & {
    excitement?: number;
    energy?: number;
    drama?: number;
  };
  onChange: (config: any) => void;
}

interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  lang?: string;
  description?: string;
}

export const VoiceEnginePanel: React.FC<Props> = ({ voiceConfig, onChange }) => {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  
  // Voice Cloning State
  const [showCloning, setShowCloning] = useState(false);
  const [cloneTab, setCloneTab] = useState<'record' | 'upload'>('record');
  const [newVoiceName, setNewVoiceName] = useState('');
  const [cloningStatus, setCloningStatus] = useState<'idle' | 'cloning' | 'success' | 'failed'>('idle');
  const [cloningError, setCloningError] = useState<string | null>(null);

  const updateConfig = (updates: Partial<any>) => {
    onChange({ ...voiceConfig, ...updates });
  };

  // Fetch available voices on mount and when provider changes
  const fetchVoices = async () => {
    setLoadingVoices(true);
    try {
      const res = await authFetch(`/api/voiceover/voices?provider=${voiceConfig.provider || 'google'}`);
      if (res.ok) {
        const data = await res.json();
        setVoices(data);
        if (data.length > 0 && (!voiceConfig.voiceId || !data.some((v: any) => v.id === voiceConfig.voiceId))) {
          updateConfig({ voiceId: data[0].id });
        }
      }
    } catch (err) {
      console.error('Failed to fetch voices:', err);
    } finally {
      setLoadingVoices(false);
    }
  };

  useEffect(() => {
    fetchVoices();
  }, [voiceConfig.provider]);

  // Clone voice call
  const handleCloneSubmit = async (audioBlob: Blob | File, originalName = 'recording.wav') => {
    if (!newVoiceName.trim()) {
      alert('Please enter a name for the cloned voice.');
      return;
    }

    setCloningStatus('cloning');
    setCloningError(null);

    const formData = new FormData();
    formData.append('name', newVoiceName);
    formData.append('description', 'Voice cloned in Excerpt Studio');
    
    if (audioBlob instanceof File) {
      formData.append('file', audioBlob);
    } else {
      const audioFile = new File([audioBlob], originalName, { type: audioBlob.type || 'audio/wav' });
      formData.append('file', audioFile);
    }

    try {
      const headers = await authHeaders();
      const res = await fetch(apiUrl('/api/voiceover/voice/clone'), {
        method: 'POST',
        headers,
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setCloningStatus('success');
        setNewVoiceName('');
        setShowCloning(false);
        await fetchVoices();
        updateConfig({ voiceId: data.voiceId });
      } else {
        const errData = await res.json();
        setCloningStatus('failed');
        setCloningError(errData.error || 'Server rejected the cloning request');
      }
    } catch (err: any) {
      console.error(err);
      setCloningStatus('failed');
      setCloningError(err.message || 'Network error during voice cloning.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (!file.type.startsWith('audio/')) {
        alert('Only audio files are supported for cloning.');
        return;
      }
      handleCloneSubmit(file, file.name);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#030712] rounded-3xl border border-white/10 overflow-hidden relative">
      <div className="p-6 border-b border-white/5 flex items-center justify-between z-10 relative">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
            <Settings2 size={20} />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg tracking-tight">Voice Engine</h2>
            <p className="text-white/40 text-[11px] font-medium tracking-wider uppercase">Neural Voice Parameters</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 relative z-10 custom-scrollbar">
        {/* Provider Selection */}
        <div className="space-y-3">
          <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Synthesis Provider</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'elevenlabs', label: 'ElevenLabs', sub: 'Premium' },
              { id: 'google', label: 'Google TTS', sub: 'Standard' },
            ].map(provider => (
              <button
                key={provider.id}
                type="button"
                onClick={() => updateConfig({ provider: provider.id as any })}
                className={`p-3 rounded-xl border text-left transition-all ${
                  voiceConfig.provider === provider.id
                    ? 'bg-indigo-500/10 border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.1)]'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'
                }`}
              >
                <div className="text-sm font-bold text-white mb-1">{provider.label}</div>
                <div className={`text-[9px] uppercase tracking-wider font-bold ${
                  voiceConfig.provider === provider.id ? 'text-indigo-400' : 'text-white/30'
                }`}>
                  {provider.sub}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Voice Selection Dropdown */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Voice Identity</label>
            {voiceConfig.provider === 'elevenlabs' && (
              <button
                type="button"
                onClick={() => setShowCloning(!showCloning)}
                className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-wider flex items-center gap-1 transition-colors"
              >
                <Plus size={12} /> {showCloning ? 'Cancel Clone' : 'Clone Voice'}
              </button>
            )}
          </div>

          {showCloning && voiceConfig.provider === 'elevenlabs' && (
            <div className="p-4 bg-white/[0.02] border border-white/10 rounded-2xl space-y-4 animate-fadeIn">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Voice Name</label>
                <input
                  type="text"
                  placeholder="e.g. My Voice Model"
                  value={newVoiceName}
                  onChange={(e) => setNewVoiceName(e.target.value)}
                  className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:border-indigo-500/50 focus:outline-none"
                />
              </div>

              <div className="flex bg-black/40 border border-white/10 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setCloneTab('record')}
                  className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    cloneTab === 'record' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/80'
                  }`}
                >
                  <Mic size={12} /> Record
                </button>
                <button
                  type="button"
                  onClick={() => setCloneTab('upload')}
                  className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    cloneTab === 'upload' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/80'
                  }`}
                >
                  <Upload size={12} /> Upload
                </button>
              </div>

              {cloneTab === 'record' ? (
                <VoiceRecorder 
                  onRecordingComplete={handleCloneSubmit} 
                  className="border-none p-0 bg-transparent"
                />
              ) : (
                <div className="h-28 border border-white/5 border-dashed rounded-xl flex flex-col items-center justify-center relative cursor-pointer hover:bg-white/[0.02] transition-colors group">
                  <input
                    type="file"
                    accept="audio/wav,audio/mpeg,audio/mp3,audio/m4a,audio/x-m4a,audio/aac"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload size={24} className="text-white/20 group-hover:text-white/40 transition-colors mb-2" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 group-hover:text-white/60">Choose Audio File</span>
                  <span className="text-[9px] text-white/20 mt-1">MP3, WAV, M4A up to 10MB</span>
                </div>
              )}

              {cloningStatus === 'cloning' && (
                <div className="flex items-center gap-2 text-xs text-indigo-400 font-bold justify-center py-1 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                  <Loader2 size={12} className="animate-spin" /> Designing voice print...
                </div>
              )}
              {cloningStatus === 'success' && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold justify-center py-1 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                  <Check size={12} /> Voice generated and added to library!
                </div>
              )}
              {cloningStatus === 'failed' && (
                <div className="text-[10px] text-red-400 font-semibold p-2.5 bg-red-500/5 rounded-xl border border-red-500/10 whitespace-pre-wrap">
                  Failed: {cloningError}
                </div>
              )}
            </div>
          )}

          {loadingVoices ? (
            <div className="h-11 bg-black/40 border border-white/10 rounded-xl px-4 flex items-center justify-center text-white/30 text-xs">
              <Loader2 size={14} className="animate-spin mr-2" /> Synapses aligning...
            </div>
          ) : (
            <select
              value={voiceConfig.voiceId || ''}
              onChange={(e) => updateConfig({ voiceId: e.target.value })}
              className="w-full h-11 bg-black/40 border border-white/10 rounded-xl px-4 text-xs text-white focus:border-indigo-500/50 focus:outline-none cursor-pointer"
            >
              {voices.map(voice => (
                <option key={voice.id} value={voice.id} className="bg-[#030712] text-white py-2">
                  {voice.name} ({voice.gender === 'MALE' ? 'Male' : voice.gender === 'FEMALE' ? 'Female' : 'Neutral'}) {voice.description ? `— ${voice.description}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Emotion Dial Dials */}
        <div className="space-y-4 pt-2 border-t border-white/5">
          <div className="text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles size={12} className="text-indigo-400" />
            Speech Emotion Controls
          </div>

          {/* Excitement */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-white/60">Excitement / High Peaks</span>
              <span className="font-mono text-indigo-400">{Math.round((voiceConfig.excitement ?? 0.5) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0" max="1" step="0.05"
              value={voiceConfig.excitement ?? 0.5}
              onChange={(e) => updateConfig({ excitement: parseFloat(e.target.value) })}
              className="w-full h-1 bg-white/10 rounded-full appearance-none accent-indigo-400 cursor-pointer"
            />
          </div>

          {/* Energy */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-white/60">Vocal Energy / Tone</span>
              <span className="font-mono text-indigo-400">{Math.round((voiceConfig.energy ?? 0.5) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0" max="1" step="0.05"
              value={voiceConfig.energy ?? 0.5}
              onChange={(e) => updateConfig({ energy: parseFloat(e.target.value) })}
              className="w-full h-1 bg-white/10 rounded-full appearance-none accent-indigo-400 cursor-pointer"
            />
          </div>

          {/* Drama */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-white/60">Drama / Narrative Tension</span>
              <span className="font-mono text-indigo-400">{Math.round((voiceConfig.drama ?? 0.5) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0" max="1" step="0.05"
              value={voiceConfig.drama ?? 0.5}
              onChange={(e) => updateConfig({ drama: parseFloat(e.target.value) })}
              className="w-full h-1 bg-white/10 rounded-full appearance-none accent-indigo-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Sliders */}
        <div className="space-y-5 pt-4 border-t border-white/5">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="flex items-center gap-2 text-xs font-bold text-white/60">
                <FastForward size={14} /> Pacing
              </label>
              <span className="text-xs font-mono text-white/40">{voiceConfig.speakingRate?.toFixed(2) || '1.00'}x</span>
            </div>
            <input
              type="range"
              min="0.5" max="2.0" step="0.05"
              value={voiceConfig.speakingRate || 1.0}
              onChange={(e) => updateConfig({ speakingRate: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-white/10 rounded-full appearance-none accent-indigo-400 cursor-pointer"
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="flex items-center gap-2 text-xs font-bold text-white/60">
                <Volume2 size={14} /> Gain
              </label>
              <span className="text-xs font-mono text-white/40">
                {(voiceConfig.volumeGainDb || 0) > 0 ? '+' : ''}{voiceConfig.volumeGainDb || 0} dB
              </span>
            </div>
            <input
              type="range"
              min="-10" max="10" step="1"
              value={voiceConfig.volumeGainDb || 0}
              onChange={(e) => updateConfig({ volumeGainDb: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-white/10 rounded-full appearance-none accent-indigo-400 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
