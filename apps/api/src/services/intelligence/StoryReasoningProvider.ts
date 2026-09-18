import { EventNode } from './EventGraph';
import { StoryArc, StoryType } from './StoryGraph';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface StoryMemory {
  characters: string[];
  topics: string[];
  openLoops: string[];
}

export interface StoryReasoningResult {
  stories: StoryArc[];
  updatedMemory: StoryMemory;
}

export abstract class StoryReasoningProvider {
  /**
   * Identifies logical story arcs within a set of events, utilizing memory from previous chunks.
   */
  abstract findStories(events: EventNode[], memory: StoryMemory): Promise<StoryReasoningResult>;
}

export class GeminiReasoningProvider extends StoryReasoningProvider {
  private geminiKeys: string[] = [];
  private currentKeyIndex = 0;
  private readonly TIMEOUT_MS = 12_000; // 12s per chunk

  constructor(apiKey?: string) {
    super();
    const envKey = apiKey || process.env.GOOGLE_AI_API_KEY || '';
    if (envKey) {
      this.geminiKeys = envKey.split(',').map(k => k.trim()).filter(Boolean);
    }
  }

  private getClient(): GoogleGenerativeAI | null {
    if (this.geminiKeys.length === 0) return null;
    const key = this.geminiKeys[this.currentKeyIndex % this.geminiKeys.length];
    return new GoogleGenerativeAI(key);
  }

  private rotateKey() {
    if (this.geminiKeys.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.geminiKeys.length;
    }
  }

  /**
   * Binds memory size to prevent prompt token explosion over long videos.
   */
  public boundMemory(memory: StoryMemory): StoryMemory {
    return {
      characters: Array.from(new Set(memory.characters)).slice(-15),
      topics: Array.from(new Set(memory.topics)).slice(-10),
      openLoops: Array.from(new Set(memory.openLoops)).slice(-5),
    };
  }

  /**
   * Deterministic heuristic fallback when LLM is offline or timed out.
   */
  public generateFallbackStories(events: EventNode[], memory: StoryMemory): StoryReasoningResult {
    const stories: StoryArc[] = [];
    if (events.length === 0) {
      return { stories, updatedMemory: this.boundMemory(memory) };
    }

    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];
    const chunkStart = firstEvent.timestamp;
    const chunkEnd = lastEvent.timestamp + lastEvent.duration;
    const duration = chunkEnd - chunkStart;

    // Determine type based on dominant event
    const highImp = events.slice().sort((a, b) => b.importance - a.importance)[0];
    const typeMap: Record<string, StoryType> = {
      GOAL: 'goal',
      SHOT: 'challenge',
      SAVE: 'challenge',
      CROWD_EXPLOSION: 'reaction',
      QUESTION: 'question',
      ANSWER: 'debate',
      JOKE: 'funny_moment',
      LAUGHTER: 'funny_moment',
      INTERRUPTION: 'argument',
    };
    const storyType: StoryType = (highImp && typeMap[highImp.type]) ? typeMap[highImp.type] : 'reveal';

    const climaxTime = highImp ? highImp.timestamp : (chunkStart + duration * 0.6);

    stories.push({
      id: `story_fallback_${firstEvent.id}`,
      title: `${highImp?.description || `${storyType.toUpperCase()} Sequence`}`,
      type: storyType,
      confidence: Math.max(0.70, highImp?.confidence ?? 0.8),
      context_required: false,
      boundaries: {
        hook_start: chunkStart,
        climax: climaxTime,
        resolution: chunkEnd,
      },
      inferred_emotions: ['interest', 'curiosity'],
      candidate_ranges: [
        {
          start: chunkStart,
          end: chunkEnd,
          reasoning: 'Fallback heuristic bounded by chunk event range',
        }
      ],
      scores: {
        hook: 80,
        context: 80,
        emotion: 75,
        curiosity: 80,
        resolution: 75,
        visual: 75,
        audio: 75,
        retention: 78,
        shareability: 72,
      },
      eventIds: events.map(e => e.id),
    });

    const newChars = events.flatMap(e => e.characters || []);
    return {
      stories,
      updatedMemory: this.boundMemory({
        characters: [...memory.characters, ...newChars],
        topics: [...memory.topics, `${storyType}_segment`],
        openLoops: memory.openLoops,
      }),
    };
  }

  async findStories(events: EventNode[], memory: StoryMemory): Promise<StoryReasoningResult> {
    if (events.length === 0) {
      return { stories: [], updatedMemory: this.boundMemory(memory) };
    }

    const client = this.getClient();
    if (!client) {
      console.log(`[GeminiReasoningProvider]: No GOOGLE_AI_API_KEY found. Utilizing deterministic story fallback.`);
      return this.generateFallbackStories(events, memory);
    }

    const eventListText = events.map(e => 
      `- [${e.id}] t=${e.timestamp.toFixed(1)}s-${(e.timestamp + e.duration).toFixed(1)}s type=${e.type} imp=${e.importance.toFixed(2)}: ${e.description || 'event'} (chars: ${(e.characters || []).join(',')})`
    ).join('\n');

    const prompt = `You are a professional video storytelling AI. Analyze this sequence of chronological events from a video and identify 1-3 compelling story arcs or self-contained viral segments.

Active Context Memory:
- Characters: ${memory.characters.join(', ') || 'none'}
- Recent Topics: ${memory.topics.join(', ') || 'none'}
- Open Loops: ${memory.openLoops.join(', ') || 'none'}

Events in this chunk:
${eventListText}

Respond ONLY with valid JSON matching this schema:
{
  "stories": [
    {
      "id": "string",
      "title": "Short punchy title",
      "type": "goal|funny_moment|debate|tutorial|reveal|reaction|challenge|failure|comeback|celebration|question|prediction|argument|unknown",
      "confidence": 0.85,
      "context_required": false,
      "boundaries": {
        "hook_start": 10.5,
        "climax": 25.0,
        "resolution": 45.0
      },
      "inferred_emotions": ["excitement", "suspense"],
      "candidate_ranges": [
        { "start": 10.5, "end": 45.0, "reasoning": "Full arc" }
      ],
      "scores": {
        "hook": 85,
        "context": 80,
        "emotion": 80,
        "curiosity": 90,
        "resolution": 80,
        "visual": 75,
        "audio": 80,
        "retention": 85,
        "shareability": 80
      },
      "eventIds": ["event_id_1"]
    }
  ],
  "updatedMemory": {
    "characters": ["char1"],
    "topics": ["topic1"],
    "openLoops": ["unresolved question or pending reaction"]
  }
}`;

    try {
      const model = client.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        }
      });

      const callPromise = model.generateContent(prompt).then(res => res.response.text());
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('GEMINI_STORY_TIMEOUT')), this.TIMEOUT_MS)
      );

      const rawText = await Promise.race([callPromise, timeoutPromise]);
      const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (parsed && Array.isArray(parsed.stories) && parsed.stories.length > 0) {
        const stories: StoryArc[] = parsed.stories.map((s: any, idx: number) => ({
          id: s.id || `story_gemini_${events[0].id}_${idx}`,
          title: s.title || 'Narrative Segment',
          type: s.type || 'reveal',
          confidence: typeof s.confidence === 'number' ? Math.max(0, Math.min(1, s.confidence)) : 0.85,
          context_required: Boolean(s.context_required),
          boundaries: {
            hook_start: Number(s.boundaries?.hook_start ?? events[0].timestamp),
            climax: Number(s.boundaries?.climax ?? (events[0].timestamp + 15)),
            resolution: Number(s.boundaries?.resolution ?? (events[events.length - 1].timestamp + events[events.length - 1].duration)),
          },
          inferred_emotions: Array.isArray(s.inferred_emotions) ? s.inferred_emotions : ['excitement'],
          candidate_ranges: Array.isArray(s.candidate_ranges) && s.candidate_ranges.length > 0
            ? s.candidate_ranges
            : [{ start: Number(s.boundaries?.hook_start ?? events[0].timestamp), end: Number(s.boundaries?.resolution ?? (events[events.length - 1].timestamp + events[events.length - 1].duration)), reasoning: 'Full story arc' }],
          scores: {
            hook: Number(s.scores?.hook ?? 80),
            context: Number(s.scores?.context ?? 80),
            emotion: Number(s.scores?.emotion ?? 75),
            curiosity: Number(s.scores?.curiosity ?? 80),
            resolution: Number(s.scores?.resolution ?? 75),
            visual: Number(s.scores?.visual ?? 75),
            audio: Number(s.scores?.audio ?? 75),
            retention: Number(s.scores?.retention ?? 80),
            shareability: Number(s.scores?.shareability ?? 75),
          },
          eventIds: Array.isArray(s.eventIds) ? s.eventIds : events.map(e => e.id),
        }));

        const updatedMemory: StoryMemory = this.boundMemory({
          characters: Array.isArray(parsed.updatedMemory?.characters)
            ? [...memory.characters, ...parsed.updatedMemory.characters]
            : memory.characters,
          topics: Array.isArray(parsed.updatedMemory?.topics)
            ? [...memory.topics, ...parsed.updatedMemory.topics]
            : memory.topics,
          openLoops: Array.isArray(parsed.updatedMemory?.openLoops)
            ? parsed.updatedMemory.openLoops
            : memory.openLoops,
        });

        return { stories, updatedMemory };
      }

      console.warn(`[GeminiReasoningProvider]: Model returned empty stories array. Falling back to heuristic.`);
      return this.generateFallbackStories(events, memory);
    } catch (err: any) {
      console.warn(`[GeminiReasoningProvider]: Reasoning failed (${err?.message || err}). Rotating key and using heuristic fallback.`);
      this.rotateKey();
      return this.generateFallbackStories(events, memory);
    }
  }
}
