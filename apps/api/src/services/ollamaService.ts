import crypto from 'crypto';

type JsonShape = 'object' | 'array';

interface OllamaBaseOptions {
  systemPrompt: string;
  userPrompt: string;
  retries?: number;
  timeoutMs?: number;
  cacheKey?: string;
}

interface OllamaJsonOptions<T> extends OllamaBaseOptions {
  shape?: JsonShape;
  fallback: T;
}

interface CachedOllamaResponse {
  raw: string;
  createdAt: number;
}

const DEFAULT_OLLAMA_URL =
  process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
const DEFAULT_OLLAMA_MODEL =
  process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
const DEFAULT_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 45000);
const responseCache = new Map<string, CachedOllamaResponse>();

function getCacheKey(options: OllamaBaseOptions) {
  if (options.cacheKey) {
    return options.cacheKey;
  }

  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        model: DEFAULT_OLLAMA_MODEL,
        systemPrompt: options.systemPrompt,
        userPrompt: options.userPrompt,
      })
    )
    .digest('hex');
}

function stripCodeFences(text: string) {
  return text.replace(/```json|```/gi, '').trim();
}

export function extractJsonSubstring(
  text: string,
  shape: JsonShape = 'object'
): string | null {
  const clean = stripCodeFences(text);
  const startChar = shape === 'array' ? '[' : '{';
  const endChar = shape === 'array' ? ']' : '}';
  const start = clean.indexOf(startChar);
  const end = clean.lastIndexOf(endChar);

  if (start !== -1 && end !== -1 && end > start) {
    return clean.slice(start, end + 1);
  }

  return null;
}

export function repairJsonString(text: string) {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\r/g, '')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
    .replace(/:\s*'([^']*)'/g, ': "$1"')
    .replace(/'([^']*)'\s*:/g, '"$1":')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null');
}

export function parseJsonWithRepair<T>(
  text: string,
  shape: JsonShape = 'object'
): T | null {
  const extracted = extractJsonSubstring(text, shape);
  if (!extracted) {
    return null;
  }

  try {
    return JSON.parse(extracted) as T;
  } catch {
    const repaired = repairJsonString(extracted);
    try {
      return JSON.parse(repaired) as T;
    } catch {
      return null;
    }
  }
}

export async function callOllamaRaw(
  options: OllamaBaseOptions
): Promise<string | null> {
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cacheKey = getCacheKey(options);
  const cached = responseCache.get(cacheKey);

  if (cached) {
    return cached.raw;
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(
        `[Ollama] Request ${attempt + 1}/${retries + 1} -> ${DEFAULT_OLLAMA_URL}`
      );
      const response = await fetch(DEFAULT_OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: DEFAULT_OLLAMA_MODEL,
          prompt: `<|system|>\n${options.systemPrompt}\n<|user|>\n${options.userPrompt}\n<|assistant|>\n`,
          stream: false,
          options: {
            temperature: 0,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama status ${response.status}`);
      }

      const data = (await response.json()) as { response?: string };
      let raw = data.response || '';

      if (
        process.env.EXCERPT_FORCE_OLLAMA_JSON_FAIL === 'true' &&
        attempt === 0
      ) {
        raw = 'BROKEN_JSON_RESPONSE';
      }

      responseCache.set(cacheKey, {
        raw,
        createdAt: Date.now(),
      });
      return raw;
    } catch (error: any) {
      console.warn(
        `[Ollama] Attempt ${attempt + 1} failed: ${error?.message || error}`
      );
      if (attempt === retries) {
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

export async function callOllamaJson<T>(
  options: OllamaJsonOptions<T>
): Promise<T> {
  const raw = await callOllamaRaw(options);

  if (!raw) {
    return options.fallback;
  }

  const parsed = parseJsonWithRepair<T>(raw, options.shape);
  if (parsed) {
    return parsed;
  }

  console.warn('[Ollama] JSON parsing failed after repair attempts. Using fallback.');
  return options.fallback;
}
