'use client';

import React, { useState } from 'react';
import { ArenaVideoPlayer } from '../../components/ArenaVideoPlayer';
import { SidebarNav } from '@/components/SidebarNav';

export default function ArenaPage() {
  const [winner, setWinner] = useState<string | null>(null);

  const storyId = 'story_123';
  // Mock candidates for the exact SAME story (e.g., tight vs loose)
  const candidateA = { id: 'cand_a', url: '/demo/story1-tight.mp4', label: 'Tight Cut (Candidate A)' };
  const candidateB = { id: 'cand_b', url: '/demo/story1-loose.mp4', label: 'Loose Cut (Candidate B)' };

  const handleVote = async (chosenId: string) => {
    setWinner(chosenId);
    
    // In production, log the match to the Offline Trainer telemetry
    /*
    await fetch('/api/intelligence/telemetry/arena', {
      method: 'POST',
      body: JSON.stringify({
        storyId,
        candidateAId: candidateA.id,
        candidateBId: candidateB.id,
        winner: chosenId
      })
    });
    */
  };

  return (
    <div className="flex h-screen bg-[#030712] text-[#e0e5f6] relative overflow-hidden">
      <SidebarNav />
      <main className="flex-grow overflow-y-auto px-4 sm:px-6 lg:px-10 pt-8 lg:pt-12 pb-32 lg:pb-12 relative z-10">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-2">Excerpt Arena ⚔️</h1>
          <p className="text-gray-400 text-center mb-8">Watch both clips and vote on which edit tells a better story.</p>
          
          <div className="flex flex-col md:flex-row justify-center items-center gap-8 mb-8">
            <ArenaVideoPlayer 
              src={candidateA.url} 
              label={candidateA.label} 
              onPlay={() => {}} 
              onPause={() => {}} 
            />
            <ArenaVideoPlayer 
              src={candidateB.url} 
              label={candidateB.label} 
              onPlay={() => {}} 
              onPause={() => {}} 
            />
          </div>

          {!winner ? (
            <div className="flex justify-center gap-4">
              <button 
                onClick={() => handleVote(candidateA.id)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition"
              >
                👈 A is Better
              </button>
              <button 
                onClick={() => handleVote('tie')}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition"
              >
                Tie
              </button>
              <button 
                onClick={() => handleVote(candidateB.id)}
                className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-lg font-semibold transition"
              >
                B is Better 👉
              </button>
            </div>
          ) : (
            <div className="text-center p-6 bg-gray-800 rounded-xl max-w-md mx-auto">
              <h2 className="text-2xl font-bold text-green-400 mb-2">Vote Recorded!</h2>
              <p className="text-gray-300">
                You voted for <strong>{winner === candidateA.id ? 'A' : winner === candidateB.id ? 'B' : 'Tie'}</strong>.
                This match has been securely logged to the Arena dataset for offline model training!
              </p>
              <button 
                onClick={() => setWinner(null)}
                className="mt-6 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
              >
                Next Battle
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
