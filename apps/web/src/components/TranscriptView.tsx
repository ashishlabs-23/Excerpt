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
        color: isExcluded ? 'rgba(255,255,255,0.15)' : isActive ? '#fff' : isCurrentMatch ? '#fbbf24' : isMatch ? '#a78bfa' : 'rgba(255,255,255,0.28)',
        backgroundColor: isExcluded
          ? 'transparent'
          : isActive
          ? 'rgba(200,119,64,0.18)'
          : isCurrentMatch
          ? 'rgba(251,191,36,0.12)'
          : 'transparent',
      }}
      transition={{ duration: 0.12 }}
      onClick={(e) => {
        // Prevent click if clicking the tiny delete button
        if ((e.target as HTMLElement).closest('.delete-btn')) return;
        onClick();
      }}
      onDoubleClick={() => setIsEditing(true)}
      tabIndex={0}
      role="button"
      aria-label={`Word: ${word}. ${isExcluded ? 'Deleted' : 'Active'}. Click to seek, double-click to edit.`}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { setIsEditing(true); e.preventDefault(); }
      }}
      className={`inline-block px-1.5 py-0.5 rounded-md cursor-pointer text-sm font-medium relative group/word transition-all duration-200
        focus:outline-none focus:ring-1 focus:ring-primary hover:bg-white/5 hover:text-white
        ${isActive ? 'font-black scale-105' : ''}
        ${isCurrentMatch ? 'ring-1 ring-amber-400/60' : ''}
        ${isExcluded ? 'line-through decoration-white/25 decoration-2' : ''}
      `}
    >
      <span className="flex items-center gap-1">
        {word}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleExclude();
          }}
          className="delete-btn opacity-0 group-hover/word:opacity-100 p-0.5 rounded-sm hover:bg-white/10 text-white/40 hover:text-white transition-all ml-0.5"
          title={isExcluded ? "Restore word" : "Delete word"}
        >
          <X size={10} className={isExcluded ? "rotate-45 text-emerald-400" : ""} />
        </button>
      </span>
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
}) => {
  const [search, setSearch] = useState('');
  const [matchIdx, setMatchIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll to active word (skip while editing or searching)
  useEffect(() => {
    if (search) return; // don't scroll while searching
    const activeEl = document.activeElement;
    if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA') return;

    const currentWordIndex = words.findIndex(w => currentTime >= w.start && currentTime <= w.end);
    if (currentWordIndex !== -1 && containerRef.current) {
      const el = containerRef.current.children[currentWordIndex] as HTMLElement | undefined;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentTime, words, search]);

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
          <span className="text-[10px] font-bold text-white/25 uppercase tracking-widest">
            {words.length - excludedWordIndices.size} / {words.length} words
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={13} />
          <input
            type="text"
            placeholder="Search transcript..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-20 rounded-xl bg-white/5 border border-white/5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 transition-colors"
          />
          {/* Match nav */}
          {matchIndices.length > 0 && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <span className="text-[9px] text-white/30 font-bold mr-1">
                {matchIdx + 1}/{matchIndices.length}
              </span>
              <button onClick={() => goToMatch(-1)} className="p-0.5 text-white/40 hover:text-white transition-colors">
                <ChevronUp size={12} />
              </button>
              <button onClick={() => goToMatch(1)} className="p-0.5 text-white/40 hover:text-white transition-colors">
                <ChevronDown size={12} />
              </button>
            </div>
          )}
          {search && matchIndices.length === 0 && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-red-400 font-bold">0</div>
          )}
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
              style={{ display: matchIndices.length > 0 ? 'none' : 'block' }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Words */}
      <div
        ref={containerRef}
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
                onClick={() => onSeek(w.start)}
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

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[#1a2235] shrink-0 flex items-center justify-between bg-[#0d1425]/50">
        <div className="flex items-center gap-2 text-[9px] text-white/20 font-bold uppercase tracking-widest">
          <Clock size={9} />
          <span>Click → seek · Hover → X to cut</span>
        </div>
        {words.length > 0 && (
          <span className="text-[9px] text-white/20 font-mono">
            {formatTime(words[0]?.start || 0)}–{formatTime(words[words.length - 1]?.end || 0)}
          </span>
        )}
      </div>
    </div>
  );
};
