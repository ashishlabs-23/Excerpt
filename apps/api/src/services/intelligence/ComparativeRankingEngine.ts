import { GoogleGenerativeAI } from "@google/generative-ai";
import { ClipCandidate } from "./CandidateGenerationEngine";
import { parseJsonWithRepair } from "../ollamaService";
import fs from 'fs';
import path from 'path';
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

    const systemPromptPath = path.join(process.cwd(), 'prompts', 'comparative_ranking', 'v1.md');
    let systemPrompt = fs.readFileSync(systemPromptPath, 'utf-8');
    systemPrompt = systemPrompt.replace('{{CANDIDATE_COUNT}}', candidates.length.toString());
    systemPrompt = systemPrompt.replace('{{TARGET_COUNT}}', targetCount.toString());

    const userPrompt = `Here are the candidates:\n\n${formattedCandidates}\n\nSelect the top ${targetCount} best clips and return JSON.`;

    const model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" }, { apiVersion: "v1" });
    const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
    const responseText = await result.response.text();
    
    const parsed = parseJsonWithRepair<any>(responseText, 'object');
    if (!parsed || parsed.schemaVersion !== "2" || !Array.isArray(parsed.selections) || parsed.selections.length === 0) {
      throw new Error("Failed to parse Stage B comparative rankings. Expected schemaVersion 2.");
    }

    const selections = parsed.selections;
    const finalClips: ClipSegment[] = [];
    
    for (const selection of selections) {
      const idx = (selection.candidate_index as number) - 1;
      if (idx >= 0 && idx < candidates.length) {
        const source = candidates[idx];
        const overallScore = Math.round(((selection.retention || 90) + (selection.curiosity || 90) + (selection.payoff || 90)) / 3);
        const reasonText = Array.isArray(selection.reason) ? selection.reason.join(" | ") : (selection.reason || source.curiosity_gap);

        finalClips.push({
          id: `clip_${Date.now()}_${idx}`,
          video_url: videoUrl,
          start_time: source.start_time,
          end_time: source.end_time,
          title: selection.title || `Ranked Clip ${idx + 1}`,
          content: source.summary,
          hook: source.hook,
          reason: reasonText,
          virality_score: overallScore,
          clip_score: overallScore,
          face_focus_score: source.visual_importance * 10,
          score_breakdown: {
            retention: selection.retention,
            curiosity: selection.curiosity,
            emotion_score: selection.emotion,
            payoff: selection.payoff,
            context_required: selection.context_required
          }
        } as any); // Casting as any to pass extended score_breakdown
      }
    }

    // Sort descending by score
    finalClips.sort((a, b) => (b.clip_score || 0) - (a.clip_score || 0));

    console.log(`[ComparativeRankingEngine] Stage B complete. Selected ${finalClips.length} top tier clips.`);
    return finalClips.slice(0, targetCount);
  }
}
