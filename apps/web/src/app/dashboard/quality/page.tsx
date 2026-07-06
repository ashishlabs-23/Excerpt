import React from 'react';

// In a real application, this would fetch the benchmark JSON reports from the API / DB
const MOCK_REPORTS = [
  {
    date: '2026-07-06',
    overallScore: 92.4,
    passed: true,
    metadata: {
      promptVersion: 'candidate_generation/v1.md',
      rankingPrompt: 'comparative_ranking/v1.md',
      model: 'gemini-2.0-flash',
      temperature: 0.3
    },
    components: [
      { component: 'BoundaryEvaluator', score: 95.1 },
      { component: 'SubtitleEvaluator', score: 91.5 },
      { component: 'RenderEvaluator', score: 100 },
      { component: 'RankingEvaluator', score: 94 },
      { component: 'DiversityEvaluator', score: 81.5 },
    ],
    regressions: []
  }
];

export default function QualityDashboard() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-white mb-2">Clip Quality Evaluation Dashboard</h1>
        <p className="text-gray-400">Objective, automated measurements of the AI clipping pipeline.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-400 uppercase">Overall Score</h3>
          <p className="text-5xl font-black text-green-400 mt-2">{MOCK_REPORTS[0].overallScore}%</p>
          <span className="text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded-full mt-4 inline-block">PASSING</span>
        </div>
        
        <div className="col-span-3 bg-gray-800 rounded-xl p-6 border border-gray-700 flex flex-col justify-center">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">Component Breakdown</h3>
          <div className="flex gap-4">
            {MOCK_REPORTS[0].components.map(c => (
              <div key={c.component} className="flex-1 bg-gray-900 rounded p-4 text-center">
                <div className="text-xs text-gray-500 mb-1">{c.component.replace('Evaluator', '')}</div>
                <div className="text-2xl font-bold text-white">{c.score}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-white mb-4">Latest Run Metadata</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500 block">Candidate Prompt</span>
            <span className="text-blue-400 font-mono">{MOCK_REPORTS[0].metadata.promptVersion}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Ranking Prompt</span>
            <span className="text-purple-400 font-mono">{MOCK_REPORTS[0].metadata.rankingPrompt}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Model Engine</span>
            <span className="text-green-400 font-mono">{MOCK_REPORTS[0].metadata.model}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Temperature</span>
            <span className="text-white">{MOCK_REPORTS[0].metadata.temperature}</span>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-bold text-white mb-4">Regression History</h3>
        {MOCK_REPORTS[0].regressions.length === 0 ? (
          <div className="text-gray-400 bg-gray-900/50 p-4 rounded text-center border border-dashed border-gray-600">
            No regressions detected in the latest build!
          </div>
        ) : (
          <ul className="space-y-2">
            {MOCK_REPORTS[0].regressions.map((r, i) => (
              <li key={i} className="text-red-400 flex items-center gap-2">
                <span className="bg-red-500/20 px-2 py-1 rounded text-xs">REGRESSION</span>
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>

    </div>
  );
}
