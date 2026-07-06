import { GoogleGenerativeAI } from "@google/generative-ai";
import { ClipCandidate } from "./CandidateGenerationEngine";
import { parseJsonWithRepair } from "../ollamaService";
import { ClipSegment } from "../aiService";

export class ComparativeRankingEngine {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');
  }

  /**
   * Stage B: Compare candidate windows pairwise or holistically and select the absolute best.
   */
  public async rankAndSelectTop(
    candidates: ClipCandidate[], 
    targetCount: number,
    videoUrl: string
  ): Promise<ClipSegment[]> {
    console.log(`[ComparativeRankingEngine] Stage B: Ranking ${candidates.length} candidates to find the top ${targetCount}...`);
    
    const formattedCandidates = candidates.map((c, i) => `
[Candidate ${i + 1}]
Time: ${c.start_time}s - ${c.end_time}s
Hook: "${c.hook}"
Payoff: "${c.payoff}"
Emotion: ${c.emotion}
Curiosity: ${c.curiosity_gap}
Confidence: ${c.confidence}/100
`).join('\n');

    const systemPrompt = `You are a professional short-form video editor for a massive social media agency.
You have been handed ${candidates.length} candidate clips from a video.
Your job is to COMPARE these candidates against each other and rank them by:
1. Expected Retention (Will viewers watch to the end?)
2. Replayability (Is the payoff satisfying enough to watch twice?)
3. Shareability (Does the curiosity gap compel someone to send it to a friend?)
4. Completeness (Is it a fully self-contained thought?)

Compare them holistically. Return exactly the top ${targetCount} clips as a JSON array.

OUTPUT FORMAT:
[
  {
    "candidate_index": 3, // The index of the candidate you selected (1-indexed based on the input)
    "reason_for_selection": "This clip has the strongest curiosity gap because...",
    "clip_score": 98,
    "title": "Platform ready title (max 50 chars)"
  }
]`;

    const userPrompt = `Here are the candidates:\n\n${formattedCandidates}\n\nSelect the top ${targetCount} best clips and return JSON.`;

    const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" }, { apiVersion: "v1" });
    const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
    const responseText = await result.response.text();
    
    const parsed = parseJsonWithRepair<any[]>(responseText, 'array');
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Failed to parse Stage B comparative rankings.");
    }

    const finalClips: ClipSegment[] = [];
    
    for (const selection of parsed) {
      const idx = (selection.candidate_index as number) - 1;
      if (idx >= 0 && idx < candidates.length) {
        const source = candidates[idx];
        finalClips.push({
          id: `clip_${Date.now()}_${idx}`,
          video_url: videoUrl,
          start_time: source.start_time,
          end_time: source.end_time,
          title: selection.title || `Ranked Clip ${idx + 1}`,
          content: source.summary,
          hook: source.hook,
          reason: selection.reason_for_selection || source.curiosity_gap,
          virality_score: selection.clip_score || source.confidence,
          clip_score: selection.clip_score || source.confidence,
          face_focus_score: source.visual_importance * 10
        });
      }
    }

    // Sort descending by score
    finalClips.sort((a, b) => (b.clip_score || 0) - (a.clip_score || 0));

    console.log(`[ComparativeRankingEngine] Stage B complete. Selected ${finalClips.length} top tier clips.`);
    return finalClips.slice(0, targetCount);
  }
}
