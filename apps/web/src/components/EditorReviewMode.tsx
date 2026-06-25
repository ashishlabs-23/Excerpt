import React, { useState } from 'react';
import { Loader2, Check, Clock, Save, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authFetch } from '@/lib/api';

interface EditorReviewModeProps {
  clipId: string;
  jobId: string;
  predictedStart?: number;
  predictedEnd?: number;
  narrativeType?: string;
  publishabilityBefore?: number;
}

export const EditorReviewMode: React.FC<EditorReviewModeProps> = ({ 
  clipId, 
  jobId, 
  predictedStart = 0, 
  predictedEnd = 0,
  narrativeType = 'Unknown',
  publishabilityBefore = 0
}) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [startSec, setStartSec] = useState(predictedStart);
  const [endSec, setEndSec] = useState(predictedEnd);

  const saveCorrection = async () => {
    setLoading(true);
    try {
      await authFetch(`/api/video/clips/${clipId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          jobId,
          narrativeType,
          predictedStart,
          predictedEnd,
          editorAdjustedStart: Number(startSec),
          editorAdjustedEnd: Number(endSec),
          publishabilityBefore,
        }),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to submit correction', error);
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async (type: string) => {
    setLoading(true);
    try {
      await authFetch(`/api/video/clips/${clipId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          jobId,
          feedbackType: type,
        }),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to submit feedback', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 rounded-[16px] bg-indigo-500/10 border border-indigo-500/20 mb-6 mt-6 shrink-0">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
          <Edit3 size={12} /> Boundary Failure Learning
        </h4>
        {success && <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1"><Check size={12}/> Logged</span>}
        {loading && <Loader2 size={12} className="animate-spin text-indigo-400" />}
      </div>
      
      <p className="text-xs text-white/60 mb-3">
        Adjust clip boundaries to train the Editorial Policy Model.
      </p>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex flex-col">
          <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Start (s)</label>
          <input 
            type="number" 
            step="0.1" 
            value={startSec} 
            onChange={(e) => setStartSec(Number(e.target.value))}
            className="w-20 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1">End (s)</label>
          <input 
            type="number" 
            step="0.1" 
            value={endSec} 
            onChange={(e) => setEndSec(Number(e.target.value))}
            className="w-20 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex flex-col justify-end h-full">
          <Button 
            variant="outline" 
            onClick={saveCorrection}
            disabled={loading || (startSec === predictedStart && endSec === predictedEnd)}
            className="h-[26px] mt-4 rounded-full bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border-indigo-500/30 text-[10px] tracking-widest uppercase font-bold"
          >
            <Save size={12} className="mr-1.5" /> Save Correction
          </Button>
        </div>
      </div>

      <div className="h-px w-full bg-white/5 my-3"></div>

      <div className="flex flex-wrap gap-2">
        <span className="text-[10px] text-white/40 uppercase tracking-wider flex items-center w-full mb-1">Mark Failure Reason (Optional)</span>
        <Button 
          variant="outline" 
          onClick={() => submitFeedback('wrong_story')}
          className="h-7 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20 text-[10px] tracking-widest uppercase font-bold"
        >
          Wrong Story
        </Button>
        <Button 
          variant="outline" 
          onClick={() => submitFeedback('missed_replay')}
          className="h-7 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20 text-[10px] tracking-widest uppercase font-bold"
        >
          Missed Replay
        </Button>
        <Button 
          variant="outline" 
          onClick={() => submitFeedback('missed_context')}
          className="h-7 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20 text-[10px] tracking-widest uppercase font-bold"
        >
          Missed Context
        </Button>
      </div>
    </div>
  );
};
