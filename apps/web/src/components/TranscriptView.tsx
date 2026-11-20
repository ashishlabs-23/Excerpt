"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Clock, Zap, X, ChevronUp, ChevronDown } from 'lucide-react';

interface Word {
  word: string;
  start: number;
  end: number;
}

interface TranscriptViewProps {
  words: Word[];
  currentTime: number;
  onSeek: (time: number) => void;
  onWordEdit?: (index: number, newWord: string) => void;
  excludedWordIndices?: Set<number>;
  onToggleExcludeWord?: (index: number) => void;
  onSetExcludedWords?: (indices: Set<number>) => void;
}

const EditableWord: React.FC<{
  word: string;
  index: number;
  isActive: boolean;
  isMatch: boolean;
  isCurrentMatch: boolean;
  isExcluded: boolean;
  onClick: () => void;
  onEdit: (newWord: string) => void;
  onToggleExclude: () => void;
}> = ({ word, index, isActive, isMatch, isCurrentMatch, isExcluded, onClick, onEdit, onToggleExclude }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(word);

  // Keep editValue in sync if parent updates the word
  useEffect(() => { if (!isEditing) setEditValue(word); }, [word, isEditing]);

  const commit = useCallback((value: string) => {
    setIsEditing(false);
    const trimmed = value.trim();
    if (trimmed && trimmed !== word) onEdit(trimmed);
    else setEditValue(word);
  }, [word, onEdit]);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => commit(e.target.value);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(e.currentTarget.value); }
    if (e.key === 'Escape') { setIsEditing(false); setEditValue(word); }
  };

  if (isEditing) {
    return (
      <input
        autoFocus
        className="inline-block bg-primary/20 text-white border border-primary/50 rounded px-2 py-0.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
        style={{ width: `${Math.max(40, editValue.length * 9)}px` }}
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <motion.span
      layout
      initial={false}
      animate={{
        color: isExcluded ? 'rgba(255,255,255,0.30)' : isActive ? '#ffffff' : isCurrentMatch ? '#fbbf24' : isMatch ? '#a78bfa' : '#cbd5e1',
        backgroundColor: isExcluded
          ? 'transparent'
          : isActive
          ? '#c87741'
          : isCurrentMatch
          ? 'rgba(251,191,36,0.22)'
          : 'transparent',
      }}
      transition={{ duration: 0.12 }}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-sm relative group/word transition-all duration-200
        hover:bg-white/10 hover:text-white
        ${isActive ? 'kinetic-word-active font-black shadow-md ring-1 ring-white/30' : 'font-medium'}
        ${isCurrentMatch ? 'ring-1 ring-amber-400/80' : ''}
        ${isExcluded ? 'line-through decoration-white/25 decoration-2 opacity-40' : ''}
      `}
    >
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={() => setIsEditing(true)}
        aria-label={`Word: ${word}. ${isExcluded ? 'Deleted' : 'Active'}. Click to seek, double-click to edit.`}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { setIsEditing(true); e.preventDefault(); }
        }}
        className="focus:outline-none focus:ring-1 focus:ring-primary rounded px-0.5 text-inherit"
      >
        {word}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExclude();
        }}
        className="delete-btn opacity-0 group-hover/word:opacity-100 p-0.5 rounded-sm hover:bg-white/10 text-slate-300 hover:text-white transition-all ml-0.5 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-primary"
        aria-label={isExcluded ? `Restore word: ${word}` : `Delete word: ${word}`}
        title={isExcluded ? "Restore word" : "Delete word"}
      >
        <X size={10} className={isExcluded ? "rotate-45 text-emerald-400" : ""} aria-hidden="true" />
      </button>
    </motion.span>
  );
};

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  words = [],
  currentTime,
  onSeek,
  onWordEdit,
  excludedWordIndices = new Set(),
  onToggleExcludeWord,
  onSetExcludedWords,
}) => {
  const [search, setSearch] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute filler words (um, uh, ah, like, er, actually, basically, literally)
  const fillerIndices = React.useMemo(() => {
    const fillerSet = new Set(['um', 'uh', 'ah', 'like', 'er', 'mm', 'hmm', 'literally', 'actually', 'basically']);
    const indices: number[] = [];
    words.forEach((w, i) => {
      const clean = w.word.toLowerCase().replace(/[^a-z]/g, '');
      if (fillerSet.has(clean)) indices.push(i);
    });
    return indices;
  }, [words]);

  // Total cut time calculation
  const cutDuration = React.useMemo(() => {
    let dur = 0;
    words.forEach((w, i) => {
      if (excludedWordIndices.has(i)) {
        dur += Math.max(0, w.end - w.start);
      }
    });
    return dur;
  }, [words, excludedWordIndices]);

  const handleCutAllFillers = useCallback(() => {
    if (!onSetExcludedWords) {
      fillerIndices.forEach(idx => onToggleExcludeWord && onToggleExcludeWord(idx));
      return;
    }
    const next = new Set(excludedWordIndices);
    fillerIndices.forEach(idx => next.add(idx));
    onSetExcludedWords(next);
  }, [fillerIndices, excludedWordIndices, onSetExcludedWords, onToggleExcludeWord]);

  const handleRestoreAll = useCallback(() => {
    if (onSetExcludedWords) {
      onSetExcludedWords(new Set());
    } else {
      excludedWordIndices.forEach(idx => onToggleExcludeWord && onToggleExcludeWord(idx));
    }
  }, [excludedWordIndices, onSetExcludedWords, onToggleExcludeWord]);

  // Indices of words that match the search query
  const matchIndices = React.useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return words.reduce<number[]>((acc, w, i) => {
      if (w.word.toLowerCase().includes(q)) acc.push(i);
      return acc;
    }, []);
  }, [search, words]);

  const currentMatchWordIdx = matchIndices[matchIdx] ?? -1;

  const goToMatch = useCallback((delta: number) => {
    if (!matchIndices.length) return;
    setMatchIdx(i => {
      const next = (i + delta + matchIndices.length) % matchIndices.length;
      return next;
    });
  }, [matchIndices]);

  // Scroll to match
  useEffect(() => {
    if (currentMatchWordIdx === -1 || !containerRef.current) return;
    const el = containerRef.current.children[currentMatchWordIdx] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentMatchWordIdx]);

  // Reset match index when search changes
  useEffect(() => { setMatchIdx(0); }, [search]);

  // Handle manual scroll pause
  const handleContainerScroll = useCallback(() => {
    setIsUserScrolling(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 3000);
  }, []);

  const resumeAutoScroll = useCallback(() => {
    setIsUserScrolling(false);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    const currentWordIndex = words.findIndex(w => currentTime >= w.start && currentTime <= w.end);
    if (currentWordIndex !== -1 && containerRef.current) {
      const el = containerRef.current.children[currentWordIndex] as HTMLElement | undefined;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentTime, words]);

  // Auto-scroll to active word (skip while editing, searching, or user scrolling manually)
  useEffect(() => {
    if (search || isUserScrolling) return;
    const activeEl = document.activeElement;
    if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA') return;

    const currentWordIndex = words.findIndex(w => currentTime >= w.start && currentTime <= w.end);
    if (currentWordIndex !== -1 && containerRef.current) {
      const el = containerRef.current.children[currentWordIndex] as HTMLElement | undefined;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentTime, words, search, isUserScrolling]);

  const formatTime = (t: number) =>
    `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  return (
    <div className="flex flex-col h-full bg-[#0a0f1a] border-l border-[#1a2235] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1a2235] bg-[#0d1425]/80 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={13} className="text-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Neural Transcript</span>
          </div>
          <div className="flex items-center gap-2">
            {cutDuration > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] font-bold">
                ✂️ {cutDuration.toFixed(1)}s cut
              </span>
            )}
            <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">
              {words.length - excludedWordIndices.size} / {words.length} words
            </span>
          </div>
        </div>

        {/* Quick Batch Tools */}
        <div className="flex items-center gap-2">
          {fillerIndices.length > 0 && (
            <button
              onClick={handleCutAllFillers}
              className="flex-1 py-1 px-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-[10px] font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
              title="Automatically remove detected filler words (um, uh, like, etc.)"
            >
              <span>⚡ Cut Fillers</span>
              <span className="px-1.5 py-0.2 rounded-full bg-primary text-black text-[8px] font-black">
                {fillerIndices.length}
              </span>
            </button>
          )}

          {excludedWordIndices.size > 0 && (
            <button
              onClick={handleRestoreAll}
              className="py-1 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-[10px] font-bold transition-all"
            >
              Restore All
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} aria-hidden="true" />
          <input
            type="text"
            placeholder="Search transcript..."
            aria-label="Search transcript"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-20 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-primary/50 transition-colors"
          />
          {/* Match nav */}
          {matchIndices.length > 0 && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <span className="text-[9px] text-slate-300 font-bold mr-1">
                {matchIdx + 1}/{matchIndices.length}
              </span>
              <button
                type="button"
                onClick={() => goToMatch(-1)}
                className="p-0.5 text-slate-300 hover:text-white transition-colors"
                aria-label="Previous search match"
              >
                <ChevronUp size={12} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => goToMatch(1)}
                className="p-0.5 text-slate-300 hover:text-white transition-colors"
                aria-label="Next search match"
              >
                <ChevronDown size={12} aria-hidden="true" />
              </button>
            </div>
          )}
          {search && matchIndices.length === 0 && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-red-400 font-bold">0</div>
          )}
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              style={{ display: matchIndices.length > 0 ? 'none' : 'block' }}
              aria-label="Clear search"
            >
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Words */}
      <div className="relative flex-grow min-h-0 flex flex-col">
        <div
          ref={containerRef}
          onScroll={handleContainerScroll}
          className="flex flex-wrap gap-x-1 gap-y-1.5 px-5 py-4 flex-grow overflow-y-auto custom-scrollbar content-start"
        >
          <AnimatePresence initial={false}>
            {words.map((w, i) => {
              const isActive = currentTime >= w.start && currentTime <= w.end;
              const isMatch = !!(search && w.word.toLowerCase().includes(search.toLowerCase()));
              const isCurrent = i === currentMatchWordIdx;
              const isExcluded = excludedWordIndices.has(i);

              return (
                <EditableWord
                  key={i}
                  word={w.word}
                  index={i}
                  isActive={isActive}
                  isMatch={isMatch}
                  isCurrentMatch={isCurrent}
                  isExcluded={isExcluded}
                  onClick={() => {
                    resumeAutoScroll();
                    onSeek(w.start);
                  }}
                  onEdit={newWord => onWordEdit && onWordEdit(i, newWord)}
                  onToggleExclude={() => onToggleExcludeWord && onToggleExcludeWord(i)}
                />
              );
            })}
          </AnimatePresence>

          {words.length === 0 && (
            <div className="w-full py-16 flex flex-col items-center gap-3 opacity-30">
              <Zap size={24} className="text-primary" />
              <p className="text-xs text-white uppercase font-black tracking-widest">No transcript</p>
              <p className="text-[10px] text-white/50 text-center">Transcript words appear here once the clip is processed</p>
            </div>
          )}

          {words.length > 0 && search && matchIndices.length === 0 && (
            <div className="w-full py-10 text-center">
              <p className="text-xs text-white/20 uppercase font-black tracking-widest">No matches found</p>
            </div>
          )}
        </div>

        {/* Floating Auto-Scroll Resume Badge */}
        {isUserScrolling && !search && words.length > 0 && (
          <button
            onClick={resumeAutoScroll}
            className="absolute bottom-3 right-5 z-20 px-3 py-1 rounded-full bg-primary/90 hover:bg-primary text-white text-[10px] font-bold shadow-lg shadow-primary/30 flex items-center gap-1.5 backdrop-blur transition-all active:scale-95 animate-in fade-in slide-in-from-bottom-2"
          >
            <Clock size={10} />
            <span>Follow Speech</span>
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[#1a2235] shrink-0 flex items-center justify-between bg-[#0d1425]/50">
        <div className="flex items-center gap-2 text-[9px] text-slate-300 font-bold uppercase tracking-widest">
          <Clock size={9} aria-hidden="true" />
          <span>Click → seek · Hover → X to cut</span>
        </div>
        {words.length > 0 && (
          <span className="text-[9px] text-slate-300 font-mono">
            {formatTime(words[0]?.start || 0)}–{formatTime(words[words.length - 1]?.end || 0)}
          </span>
        )}
      </div>
    </div>
  );
};
