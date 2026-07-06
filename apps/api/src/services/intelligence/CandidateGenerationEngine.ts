import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { parseJsonWithRepair } from "../ollamaService";
import { TranscriptionResult } from "../transcriptionService";

export interface ClipCandidate {
  start_time: number;
  end_time: number;
  hook: string;
  payoff: string;
  emotion: string;
  curiosity_gap: string;
  visual_importance: number;
  confidence: number;
  summary: string;
}

export class CandidateGenerationEngine {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  /**
   * Stage A: Generate 20-30 high-potential candidate windows from the transcript.
   * Leverages word-level timestamps if available, but falls back to segment timings.
   */
  public async generateCandidates(
    transcription: TranscriptionResult, 
    videoUrl: string
  ): Promise<ClipCandidate[]> {
    console.log('[CandidateGenerationEngine] Stage A: Generating raw candidate windows...');
    
    // Pass the transcript with word or segment level timestamps to the LLM.
    // For cost/context window reasons, we might chunk the transcript if it's too long,
    // but for now we assume it fits in an 8k/32k window.
    
    const systemPrompt = `You are an elite short-form clip curator.
Your task is to scan the following transcript and generate 20 to 30 highly engaging clip candidate windows.

EACH CANDIDATE MUST HAVE:
- start_time: Number in seconds (exact start of the hook).
- end_time: Number in seconds (exact end of the payoff).
- hook: The exact spoken line that grabs attention.
- payoff: The exact spoken line that concludes the thought.
- emotion: The dominant emotion (e.g., 'Humorous', 'Tense', 'Educational').
- curiosity_gap: Why the viewer will keep watching after the hook.
- visual_importance: 1-10 (How important is it to see the speaker's face or action here?).
- confidence: 1-100 (Your confidence that this is a viral moment).
- summary: A 1-sentence summary of the candidate.

RULES:
- Length MUST be between 15 and 60 seconds.
- Do not cut mid-sentence.
- Find curiosity gaps, emotional peaks, and laughter.
- Return strictly a JSON array of these objects.`;

    const userPrompt = `Transcript:\n<transcript>\n${transcription.text}\n</transcript>\n\nReturn 20-30 candidates in JSON.`;

    const response = await this.groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" } // Using standard completion, will parse later
    });

    const content = response.choices[0]?.message?.content || "[]";
    const parsed = parseJsonWithRepair<any>(content, "array");
    
    // In case the model wrapped it in an object like { "candidates": [...] }
    let rawArray = [];
    if (Array.isArray(parsed)) {
      rawArray = parsed;
    } else if (parsed && Array.isArray(parsed.candidates)) {
      rawArray = parsed.candidates;
    } else {
      throw new Error("Failed to parse Stage A candidates from LLM.");
    }

    // Filter out wildly out-of-bounds candidates
    const validCandidates = rawArray.filter(c => 
      typeof c.start_time === 'number' && 
      typeof c.end_time === 'number' &&
      c.end_time - c.start_time >= 10 &&
      c.end_time - c.start_time <= 90
    );

    console.log(`[CandidateGenerationEngine] Stage A complete. Generated ${validCandidates.length} viable candidates.`);
    return validCandidates;
  }
}
