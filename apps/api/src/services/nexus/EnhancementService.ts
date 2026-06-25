import crypto from 'crypto';
import { LearningService } from './LearningService';
import { AIService } from '../aiService';
import {
  callOllamaJson,
  parseJsonWithRepair,
} from '../ollamaService';

export interface ViralEnhancement {
  hook: string;
  title: string;
  description: string;
  keywords: string;
  caption?: string;
  hashtags?: string[];
  fallback_used?: boolean;
}

interface HookRewritePayload {
  hook: string;
  fallback_used?: boolean;
  status?: string;
}

interface MetadataPayload {
  title: string;
  description: string;
  keywords: string;
  caption?: string;
  hashtags?: string[];
  fallback_used?: boolean;
  status?: string;
}

export class EnhancementService {
  private learning = LearningService.getInstance();
  private ai = new AIService();
  private metadataCache = new Map<string, MetadataPayload>();
  private rewriteCache = new Map<string, HookRewritePayload>();

  private getTranscriptPreview(transcript: string) {
    const words = transcript.trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 12).join(' ') || 'Original Clip Starter';
  }

  private getRewriteCacheKey(transcript: string, originalTitle: string) {
    return crypto
      .createHash('sha256')
      .update(`rewrite:${transcript}:${originalTitle}`)
      .digest('hex');
  }

  private getMetadataCacheKey(transcript: string, originalTitle: string) {
    return crypto
      .createHash('sha256')
      .update(`metadata:${transcript}:${originalTitle}`)
      .digest('hex');
  }

  private getCombinedCacheKey(transcript: string) {
    return crypto.createHash('sha256').update(transcript).digest('hex');
  }

  private getFallbackMetadata(originalTitle: string): MetadataPayload {
    return {
      title: originalTitle,
      description: 'Viral clip from the original source featuring the most engaging hooks and key moments.',
      keywords: 'viral, podcast, moments',
      caption: 'Check this clip out.',
      hashtags: ['viral', 'shorts', 'clips'],
      fallback_used: true,
      status: 'skipped',
    };
  }

  private parseProviderJson<T>(text: string, fallback: T): T {
    const parsedObject = parseJsonWithRepair<T>(text, 'object');
    return parsedObject || fallback;
  }

  private async runProviderJson<T>(
    providers: Array<{ name: string; run: () => Promise<T> }>
  ): Promise<T | null> {
    for (const provider of providers) {
      try {
        return await provider.run();
      } catch (error) {
        console.error(`[Nexus] Enhancement failed via ${provider.name}:`, error);
      }
    }
    return null;
  }

  public async rewriteHook(
    transcript: string,
    originalTitle: string,
    hookScore: number
  ): Promise<HookRewritePayload> {
    const localFallback: HookRewritePayload = {
      hook: `${this.getTranscriptPreview(transcript)}...`,
      fallback_used: hookScore < 0.8,
      status: hookScore >= 0.8 ? 'skipped' : 'fallback',
    };

    if (hookScore >= 0.8) {
      console.log('[Nexus] Local hook quality sufficient. Skipping rewrite.');
      return localFallback;
    }

    const cacheKey = this.getRewriteCacheKey(transcript, originalTitle);
    const cached = this.rewriteCache.get(cacheKey);
    if (cached) {
      console.log('[Nexus] Hook rewrite cache HIT:', cacheKey.slice(0, 8));
      return cached;
    }

    const systemPrompt = `
      You are a Viral Content Strategist.
      Rewrite the opening hook of the transcript into a short, curiosity-driven line.
      Return ONLY JSON:
      {
        "hook": "string"
      }
    `;
    const userPrompt = `Transcript: "${transcript}"\nOriginal Title: "${originalTitle}"`;

    const providers = [
      {
        name: 'Ollama',
        run: () =>
          callOllamaJson<HookRewritePayload>({
            systemPrompt,
            userPrompt,
            fallback: {
              ...localFallback,
              fallback_used: true,
              status: 'skipped',
            },
          }),
      },
      {
        name: 'Gemini',
        run: async () =>
          this.parseProviderJson<HookRewritePayload>(
            await (this.ai as any).generateWithGemini(systemPrompt, userPrompt),
            {
              ...localFallback,
              fallback_used: true,
              status: 'skipped',
            }
          ),
      },
      {
        name: 'Groq',
        run: async () =>
          this.parseProviderJson<HookRewritePayload>(
            await (this.ai as any).generateWithGroq(systemPrompt, userPrompt),
            {
              ...localFallback,
              fallback_used: true,
              status: 'skipped',
            }
          ),
      },
    ];

    const result =
      (await this.runProviderJson(providers)) || {
        ...localFallback,
        fallback_used: true,
        status: 'skipped',
      };

    const safeResult = {
      hook: result.hook || localFallback.hook,
      fallback_used: Boolean(result.fallback_used),
      status: result.status || (result.hook ? 'success' : 'skipped'),
    };

    this.rewriteCache.set(cacheKey, safeResult);
    return safeResult;
  }

  public async generateMetadata(
    transcript: string,
    originalTitle: string
  ): Promise<MetadataPayload> {
    const cacheKey = this.getMetadataCacheKey(transcript, originalTitle);
    const cached = this.metadataCache.get(cacheKey);
    if (cached) {
      console.log('[Nexus] Metadata cache HIT:', cacheKey.slice(0, 8));
      return cached;
    }

    const fallback = this.getFallbackMetadata(originalTitle);
    const systemPrompt = `
      You are a Social Media Strategist.
      Generate metadata for a viral short-form clip.
      Return ONLY JSON:
      {
        "title": "string",
        "description": "string",
        "keywords": "comma,separated,keywords",
        "caption": "string",
        "hashtags": ["tag1", "tag2", "tag3"]
      }
    `;
    const userPrompt = `Transcript: "${transcript}"\nOriginal Title: "${originalTitle}"`;

    const providers = [
      {
        name: 'Ollama',
        run: () =>
          callOllamaJson<MetadataPayload>({
            systemPrompt,
            userPrompt,
            fallback,
          }),
      },
      {
        name: 'Gemini',
        run: async () =>
          this.parseProviderJson<MetadataPayload>(
            await (this.ai as any).generateWithGemini(systemPrompt, userPrompt),
            fallback
          ),
      },
      {
        name: 'Groq',
        run: async () =>
          this.parseProviderJson<MetadataPayload>(
            await (this.ai as any).generateWithGroq(systemPrompt, userPrompt),
            fallback
          ),
      },
    ];

    const result = (await this.runProviderJson(providers)) || fallback;
    const safeResult: MetadataPayload = {
      title: result.title || originalTitle,
      description: result.description || fallback.description,
      keywords: result.keywords || fallback.keywords,
      caption: result.caption || fallback.caption,
      hashtags:
        Array.isArray(result.hashtags) && result.hashtags.length > 0
          ? result.hashtags
          : fallback.hashtags,
      fallback_used: Boolean(result.fallback_used),
      status: result.status || (result.title ? 'success' : 'skipped'),
    };

    this.metadataCache.set(cacheKey, safeResult);
    return safeResult;
  }

  /**
   * Backward-compatible wrapper for older call sites.
   */
  public async getViralEnhancement(
    transcript: string,
    originalTitle: string,
    forceRewrite: boolean = false,
    hookScore: number = forceRewrite ? 0.5 : 0.8
  ): Promise<ViralEnhancement> {
    const hash = this.getCombinedCacheKey(transcript);
    const cached = await this.learning.getCachedEnhancement(hash);
    if (cached) {
      console.log('[Nexus] Cache HIT for Viral Enhancement:', hash.slice(0, 8));
      return {
        hook: cached.hook,
        title: cached.title,
        description: cached.description,
        keywords: cached.keywords,
      };
    }

    const [hookResult, metadataResult] = await Promise.allSettled([
      this.rewriteHook(transcript, originalTitle, hookScore),
      this.generateMetadata(transcript, originalTitle),
    ]);

    const hook =
      hookResult.status === 'fulfilled'
        ? hookResult.value.hook
        : `${this.getTranscriptPreview(transcript)}...`;
    const metadata =
      metadataResult.status === 'fulfilled'
        ? metadataResult.value
        : this.getFallbackMetadata(originalTitle);

    const merged: ViralEnhancement = {
      hook,
      title: metadata.title || originalTitle,
      description: metadata.description || 'Engaging content extracted via AI video parsing for viral short-form distribution.',
      keywords: metadata.keywords || 'trending, video, moments',
      caption: metadata.caption,
      hashtags: metadata.hashtags,
      fallback_used:
        (hookResult.status === 'fulfilled' && hookResult.value.fallback_used) ||
        (metadataResult.status === 'fulfilled' && metadataResult.value.fallback_used) ||
        hookResult.status === 'rejected' ||
        metadataResult.status === 'rejected',
    };

    this.learning.setCachedEnhancement(hash, merged);
    return merged;
  }
}
