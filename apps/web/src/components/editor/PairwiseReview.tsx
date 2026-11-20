import React, { useState } from 'react';

interface PairwiseReviewProps {
  clipAUrl: string;
  clipBUrl: string;
  storyArchetype: string;
  onSubmit: (data: any) => void;
}

export const PairwiseReview: React.FC<PairwiseReviewProps> = ({ clipAUrl, clipBUrl, storyArchetype, onSubmit }) => {
  const [winner, setWinner] = useState<'A' | 'B' | null>(null);
  const [confidence, setConfidence] = useState<number>(3);
  const [reasons, setReasons] = useState<string[]>([]);
  const startTime = React.useRef(Date.now());

  const toggleReason = (reason: string) => {
    setReasons(prev => prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]);
  };

  const handleSubmit = () => {
    if (!winner) return;
    const decisionTimeMs = Date.now() - startTime.current;
    
    onSubmit({
      winner,
      loser: winner === 'A' ? 'B' : 'A',
      story_archetype: storyArchetype,
      confidence,
      reasons,
      decision_time_ms: decisionTimeMs,
      created_at: new Date().toISOString()
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6 bg-gray-900 text-white rounded-lg shadow-xl">
      <h2 className="text-2xl font-bold">Pairwise Preference: {storyArchetype}</h2>
      
      <div className="flex gap-4">
        <div className="flex-1 bg-gray-800 p-4 rounded text-center flex flex-col">
          {clipAUrl ? (
            <video 
              src={clipAUrl} 
              controls 
              className="w-full h-48 object-cover rounded mb-2 bg-black"
              preload="metadata"
            />
          ) : (
            <div className="w-full h-48 bg-black mb-2 flex items-center justify-center text-gray-400 rounded">
              Clip A Preview Unavailable
            </div>
          )}
          <button 
            className={`px-6 py-2 rounded font-bold mt-auto ${winner === 'A' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`}
            onClick={() => setWinner('A')}
          >
            Select A
          </button>
        </div>
        <div className="flex-1 bg-gray-800 p-4 rounded text-center flex flex-col">
          {clipBUrl ? (
            <video 
              src={clipBUrl} 
              controls 
              className="w-full h-48 object-cover rounded mb-2 bg-black"
              preload="metadata"
            />
          ) : (
            <div className="w-full h-48 bg-black mb-2 flex items-center justify-center text-gray-400 rounded">
              Clip B Preview Unavailable
            </div>
          )}
          <button 
            className={`px-6 py-2 rounded font-bold mt-auto ${winner === 'B' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`}
            onClick={() => setWinner('B')}
          >
            Select B
          </button>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded">
        <h3 className="font-semibold mb-2">Confidence (1-5)</h3>
        <input 
          type="range" min="1" max="5" value={confidence} 
          onChange={(e) => setConfidence(Number(e.target.value))} 
          className="w-full"
        />
        <div className="text-center">{confidence}</div>
      </div>

      <div className="bg-gray-800 p-4 rounded">
        <h3 className="font-semibold mb-2">Primary Reason(s)</h3>
        <div className="grid grid-cols-2 gap-2">
          {["Missing buildup", "Missing reaction", "Wrong story", "Too long", "Too short", "Better emotion", "Better tension", "Better context"].map(r => (
            <label key={r} className="flex items-center gap-2">
              <input type="checkbox" checked={reasons.includes(r)} onChange={() => toggleReason(r)} />
              {r}
            </label>
          ))}
        </div>
      </div>

      <button 
        onClick={handleSubmit} 
        disabled={!winner}
        className="w-full py-3 bg-green-600 disabled:bg-gray-700 font-bold rounded mt-4 hover:bg-green-500"
      >
        Submit Decision
      </button>
    </div>
  );
};
