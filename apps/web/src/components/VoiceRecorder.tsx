"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Pause, Volume2 } from 'lucide-react';

interface Props {
  onRecordingComplete: (blob: Blob) => void;
  className?: string;
}

export const VoiceRecorder: React.FC<Props> = ({ onRecordingComplete, className = '' }) => {
  const [status, setStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [duration, setDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopTracksAndAnimations();
    };
  }, []);

  const stopTracksAndAnimations = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
  };

  const startRecording = async () => {
    chunksRef.current = [];
    setDuration(0);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onRecordingComplete(audioBlob);
      };

      // Set up Web Audio API for visual waveform
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      // Start recording
      mediaRecorder.start(250); // get data slices every 250ms
      setStatus('recording');

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      // Start visualizer
      drawWaveform();

    } catch (err) {
      console.error('Failed to start recording:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && status === 'recording') {
      mediaRecorderRef.current.pause();
      setStatus('paused');
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioContextRef.current) audioContextRef.current.suspend();
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && status === 'paused') {
      mediaRecorderRef.current.resume();
      setStatus('recording');
      
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      if (audioContextRef.current) audioContextRef.current.resume();
      drawWaveform();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && (status === 'recording' || status === 'paused')) {
      mediaRecorderRef.current.stop();
      setStatus('idle');
      stopTracksAndAnimations();
    }
  };

  const drawWaveform = () => {
    if (!canvasRef.current || !analyserRef.current || status === 'paused') return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (status === 'idle') return;
      animationFrameRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      // Draw center line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;

        // Gradient color for bars (Indigo to Orange)
        const gradient = ctx.createLinearGradient(0, canvas.height / 2 - barHeight, 0, canvas.height / 2 + barHeight);
        gradient.addColorStop(0, '#6366f1'); // Indigo
        gradient.addColorStop(0.5, '#c084fc'); // Purple
        gradient.addColorStop(1, '#f97316'); // Orange

        ctx.fillStyle = gradient;

        // Draw symmetrical bars from center
        const yTop = (canvas.height / 2) - barHeight;
        ctx.fillRect(x, yTop, barWidth - 2, barHeight * 2);

        x += barWidth;
      }
    };

    draw();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`p-4 bg-black/40 border border-white/10 rounded-2xl flex flex-col gap-4 items-center ${className}`}>
      {/* Waveform Visualization Canvas */}
      <div className="w-full h-24 bg-[#030712] rounded-xl border border-white/5 overflow-hidden relative">
        <canvas 
          ref={canvasRef} 
          width={400} 
          height={96} 
          className="w-full h-full block" 
        />
        {status === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center text-white/30 text-xs font-bold uppercase tracking-widest pointer-events-none">
            Ready to Record
          </div>
        )}
      </div>

      <div className="flex items-center justify-between w-full px-2">
        {/* Timer Duration */}
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${status === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-white/20'}`} />
          <span className="font-mono text-sm text-white/60 font-bold">{formatTime(duration)}</span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {status === 'idle' ? (
            <button
              onClick={startRecording}
              className="h-10 px-5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
            >
              <Mic size={14} /> Record
            </button>
          ) : (
            <>
              {status === 'recording' ? (
                <button
                  onClick={pauseRecording}
                  type="button"
                  className="w-10 h-10 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center transition-colors"
                  title="Pause"
                >
                  <Pause size={16} />
                </button>
              ) : (
                <button
                  onClick={resumeRecording}
                  type="button"
                  className="w-10 h-10 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 rounded-xl flex items-center justify-center transition-colors"
                  title="Resume"
                >
                  <Play size={16} fill="currentColor" />
                </button>
              )}

              <button
                onClick={stopRecording}
                type="button"
                className="h-10 px-5 bg-red-500 hover:bg-red-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
              >
                <Square size={14} fill="currentColor" /> Stop & Add
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
