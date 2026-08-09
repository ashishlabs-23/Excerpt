import { TranscriptionResult } from '../../types/pipeline';

export class CandidatePromptBuilder {
  /**
   * Builds the system and user prompts for candidate generation.
   * Does NOT make network calls.
   */
  public buildPrompt(transcription: TranscriptionResult): { systemPrompt: string; userPrompt: string } {
    // In the future, we could read this from a config or inject it.
    const systemPrompt = `You are a professional video editor. Your task is to identify 20-30 high-potential viral clip boundaries from the provided transcript.
Find highly engaging moments:
- Look for strong emotional reactions
- Find clear setups and payoffs
- Identify curiosity gaps

Return the result as JSON in this format:
{
  "candidates": [
    {
      "start_time": 10.5,
      "end_time": 45.2,
      "hook": "The first 3 seconds describing the hook",
      "payoff": "The climax/payoff description",
      "emotion": "excited, tense, funny...",
      "curiosity_gap": "Why is this interesting to watch?",
      "visual_importance": 0.8,
      "confidence": 0.9,
      "summary": "Brief summary"
    }
  ]
}`;
    const userPrompt = `Transcript:\n<transcript>\n${transcription.text}\n</transcript>\n\nReturn 20-30 candidates in JSON.`;
    return { systemPrompt, userPrompt };
  }
}
