import React, { useState } from 'react';
import { Loader2, Check, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authFetch } from '@/lib/api';

interface BoundaryTournamentProps {
  clipId: string;
  jobId: string;
  narrativeType: string;
  boundaryASource?: string;
  boundaryBSource?: string;
}

export const BoundaryTournament: React.FC<BoundaryTournamentProps> = ({ 
  clipId, 
  jobId, 
  narrativeType = 'Unknown',
  boundaryASource = 'ai_learned',
  boundaryBSource = 'ai_default'
}) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const submitWinner = async (winner: string) => {
    setLoading(true);
    try {
      await authFetch(`/api/tournament/log`, {
        method: 'POST',
        body: JSON.stringify({
          clipId,
          jobId,
          narrativeType,
          boundaryASource,
          boundaryBSource,
          winner,
          confidence: 1.0,
          reason: 'Blind A/B selection'
        }),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to log tournament winner', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 rounded-[16px] bg-rose-500/10 border border-rose-500/20 mb-6 mt-6 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-2">
          <Swords size={12} /> Boundary Tournament (Blind A/B)
        </h4>
        {success && <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1"><Check size={12}/> Logged</span>}
        {loading && <Loader2 size={12} className="animate-spin text-rose-400" />}
      </div>
      
      <p className="text-xs text-white/60 mb-3">
        Evaluate the clipping accuracy. Which boundary presentation is better?
      </p>

      <div className="flex flex-wrap gap-3">
        <Button 
          variant="outline" 
          onClick={() => submitWinner('A')}
          disabled={loading || success}
          className="h-8 flex-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border-indigo-500/30 text-[10px] tracking-widest uppercase font-bold"
        >
          Clip A is Better
        </Button>
        <Button 
          variant="outline" 
          onClick={() => submitWinner('B')}
          disabled={loading || success}
          className="h-8 flex-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border-amber-500/30 text-[10px] tracking-widest uppercase font-bold"
        >
          Clip B is Better
        </Button>
      </div>
      
      <div className="flex w-full mt-2">
        <Button 
          variant="outline" 
          onClick={() => submitWinner('TIE')}
          disabled={loading || success}
          className="h-6 w-full rounded bg-white/5 hover:bg-white/10 text-white/40 border-white/10 text-[9px] tracking-widest uppercase font-bold"
        >
          No Difference (Tie)
        </Button>
      </div>
    </div>
  );
};
