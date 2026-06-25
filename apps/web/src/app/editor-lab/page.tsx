"use client";

import React from 'react';
import { PairwiseReview } from '../../components/editor/PairwiseReview';

export default function EditorLabPage() {
  const handleDecisionSubmit = async (data: any) => {
    console.log("Submitting Pairwise Decision:", data);
    // In production, this POSTs to /api/editor/pairwise
    alert(`Decision logged! Winner: ${data.winner} (Confidence: ${data.confidence})`);
  };

  return (
    <div className="min-h-screen bg-black p-8 flex justify-center items-center">
      <div className="max-w-4xl w-full">
        <h1 className="text-4xl font-extrabold text-white mb-8 text-center">Editor Annotation Workbench</h1>
        <p className="text-gray-400 text-center mb-12">Industrializing the collection of high-quality editorial decisions.</p>
        
        <PairwiseReview 
          clipAUrl="/mock/clip_a.mp4" 
          clipBUrl="/mock/clip_b.mp4" 
          storyArchetype="goalkeeper_heroics" 
          onSubmit={handleDecisionSubmit} 
        />
      </div>
    </div>
  );
}
