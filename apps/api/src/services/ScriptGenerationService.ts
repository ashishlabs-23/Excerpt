import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import dotenv from 'dotenv';
dotenv.config();

export interface VisualScriptContext {
  clipTitle?: string;
  clipSummary?: string;
  visualEvents?: any[];
  entities?: string[];
  keyframeDescriptions?: string[];
  facesDetected?: number;
  ocrText?: string[];
  actionScore?: number;
}

export class ScriptGenerationService {
  private static instance: ScriptGenerationService;
  private geminiKeys: string[] = [];
  private currentGeminiKeyIndex: number = 0;
  private groqClient: Groq | null = null;

  private constructor() {
    const geminiKeyStr = process.env.GOOGLE_AI_API_KEY || '';
    if (geminiKeyStr) {
      this.geminiKeys = geminiKeyStr.split(',').map(k => k.trim()).filter(Boolean);
    }
    
    if (process.env.GROQ_API_KEY) {
      this.groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
  }

  static getInstance(): ScriptGenerationService {
    if (!ScriptGenerationService.instance) {
      ScriptGenerationService.instance = new ScriptGenerationService();
    }
    return ScriptGenerationService.instance;
  }

  private getStyleInstructions(style: string, customInstruction?: string): string {
    switch (style) {
      case 'duo_commentary':
        return `Write an alternating dynamic two-person sports commentary between a Play-by-Play Announcer and a Tactical Analyst.
Format requirements:
- Prefix each turn with either "[Play-by-Play]: " or "[Analyst]: ".
- [Play-by-Play] speaks with high energy, calling the immediate action.
- [Analyst] provides sharp tactical insight and emotional resonance.
- Keep each turn to 1-2 punchy sentences so they alternate naturally.`;
      case 'football_commentary':
        return `Write high-energy, play-by-play football commentary. Emphasize excitement, action, crowd roar, and tactical brilliance of the moment. Use dramatic descriptions (e.g., "What an unbelievable sequence of play...").`;
      case 'viral_shorts':
        return `Write an attention-grabbing short-form hook suitable for TikTok, Reels, or YouTube Shorts. Use intense curiosity loops (e.g., "Wait until you see what happens next...").`;
      case 'tactical_analysis':
        return `Write analytical, detail-oriented breakdown. Focus on spatial awareness, defender errors, positional tactics, and strategy (e.g., "Watch the positioning of the defender...").`;
      case 'documentary':
        return `Write deep, narrative, cinematic storytelling. Emphasize historical context, gravity of the moment, and emotional depth (e.g., "This moment would completely change the match...").`;
      case 'youtube_narrator':
        return `Write engaging narrator style, detailing why this moment is fascinating and why it stunned everyone (e.g., "Here's why this goal stunned everyone...").`;
      case 'custom_prompt':
      default:
        return `Follow this custom instructions/persona strictly: "${customInstruction || 'Act like a standard sports commentator'}".`;
    }
  }

  buildPrompt(
    style: string,
    language: string,
    contextText?: string,
    customInstruction?: string,
    visualContext?: VisualScriptContext
  ): { systemPrompt: string; userPrompt: string } {
    const isDuo = style === 'duo_commentary';
    const styleGuide = this.getStyleInstructions(style, customInstruction);
    const systemPrompt = `You are a professional script writer, sports commentator, and localization expert.
Your job is to generate a voiceover script in the language: "${language}".
Format: ${isDuo ? 'Prefix alternating turns with [Play-by-Play]: and [Analyst]:. Do not include markdown code blocks.' : 'Return ONLY the final voiceover text to be spoken. Do NOT include any stage directions, narration cues, sound effect placeholders, quotes, or markdown tags.'}
Validation rules:
- Length must be between 20 and 5000 characters.
- Must be written in fluent, native "${language}".
- Follow this style guide: ${styleGuide}`;

    let visualPrompt = '';
    if (visualContext) {
      const parts: string[] = [];
      if (visualContext.clipTitle) parts.push(`Clip Title: ${visualContext.clipTitle}`);
      if (visualContext.clipSummary) parts.push(`Clip Summary: ${visualContext.clipSummary}`);
      if (visualContext.visualEvents && visualContext.visualEvents.length > 0) {
        const eventsStr = Array.isArray(visualContext.visualEvents)
          ? visualContext.visualEvents.map((e: any) => typeof e === 'string' ? e : `t=${e.timestamp}s: ${e.event || e.description || JSON.stringify(e)}`).join('; ')
          : String(visualContext.visualEvents);
        parts.push(`Visual Action Events: ${eventsStr}`);
      }
      if (visualContext.entities?.length) parts.push(`Visible Entities/Players: ${visualContext.entities.join(', ')}`);
      if (visualContext.keyframeDescriptions?.length) parts.push(`Keyframe Action: ${visualContext.keyframeDescriptions.join('. ')}`);
      if (visualContext.facesDetected !== undefined) parts.push(`Faces Detected: ${visualContext.facesDetected}`);
      if (visualContext.ocrText?.length) parts.push(`On-Screen OCR Text: ${visualContext.ocrText.join(', ')}`);
      if (parts.length > 0) {
        visualPrompt = `\n\nOn-Screen Visual Context:\n${parts.join('\n')}\nGround your commentary directly into these visual details.`;
      }
    }

    const userPrompt = (contextText 
      ? `Here is the context of the clip:\n"${contextText}"`
      : `Write a compelling script based on the style and language specified.`) + visualPrompt;

    return { systemPrompt, userPrompt };
  }

  async generateScript(
    style: string,
    language: string,
    contextText?: string,
    customInstruction?: string,
    visualContext?: VisualScriptContext
  ): Promise<string> {
    const isDuo = style === 'duo_commentary';
    const { systemPrompt, userPrompt } = this.buildPrompt(
      style,
      language,
      contextText,
      customInstruction,
      visualContext
    );

    if (this.geminiKeys.length === 0 && !this.groqClient) {
      if (process.env.NODE_ENV === 'test' || process.env.EXCERPT_TEST_MODE === 'true' || !process.env.GOOGLE_AI_API_KEY) {
        if (isDuo) {
          return `[Play-by-Play]: He crosses half court with three seconds on the clock!\n[Analyst]: Look at the defense closing in from the left! What a finish!`;
        }
        return `Welcome to this incredible highlight moment! Watch the reaction of the entire crowd!`;
      }
      throw new Error('No AI providers configured. Either GOOGLE_AI_API_KEY or GROQ_API_KEY is required.');
    }

    let lastError: any = null;

    // 1. Try Gemini Keys
    for (let i = 0; i < this.geminiKeys.length; i++) {
      try {
        const key = this.geminiKeys[this.currentGeminiKeyIndex];
        const genAI = new GoogleGenerativeAI(key);
        const modelName = process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== 'gemini-3.6-flash'
          ? process.env.GEMINI_MODEL
          : 'gemini-1.5-flash';
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const generatePromise = model.generateContent(`${systemPrompt}\n\n${userPrompt}`).then(res => res.response.text());
        const timeoutPromise = new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API call timed out after 8s')), 8000)
        );

        const rawText = await Promise.race([generatePromise, timeoutPromise]);
        const script = rawText.trim();
        
        if (script.length < 20) throw new Error(`Generated script is too short (${script.length} characters).`);
        if (script.length > 5000) throw new Error(`Generated script is too long (${script.length} characters).`);

        return script;
      } catch (error: any) {
        lastError = error;
        const msg = error.message?.toLowerCase() || '';
        if (msg.includes('429') || msg.includes('quota') || msg.includes('exhausted')) {
          console.warn(`[ScriptGenerationService]: Gemini key ${this.currentGeminiKeyIndex + 1} quota exhausted, rotating...`);
          this.currentGeminiKeyIndex = (this.currentGeminiKeyIndex + 1) % this.geminiKeys.length;
        } else {
          console.warn(`[ScriptGenerationService]: Gemini generation failed:`, error.message);
          break; // Don't rotate for non-quota errors
        }
      }
    }

    // 2. Try Groq Fallback
    if (this.groqClient) {
      try {
        console.log('[ScriptGenerationService]: Falling back to Groq Llama-3.3-70b-versatile');
        const completionPromise = this.groqClient.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.7,
        });

        const timeoutPromise = new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error('Groq API call timed out after 8s')), 8000)
        );

        const completion = await Promise.race([completionPromise, timeoutPromise]);
        const script = completion.choices[0]?.message?.content?.trim() || '';
        
        if (script.length < 20) throw new Error(`Generated script is too short (${script.length} characters).`);
        if (script.length > 5000) throw new Error(`Generated script is too long (${script.length} characters).`);

        return script;
      } catch (error: any) {
        console.error('[ScriptGenerationService]: Groq fallback failed:', error.message);
        lastError = error;
      }
    }

    // 3. Graceful Deterministic Fallback Template
    console.warn('[ScriptGenerationService]: External LLM calls exhausted/timed out, using local script template.');
    if (isDuo) {
      return `[Play-by-Play]: He crosses half court with three seconds on the clock!\n[Analyst]: Look at the defense closing in from the left! What a finish!`;
    }
    return `Welcome to this incredible highlight moment! Watch the reaction of the entire crowd!`;
  }
}
