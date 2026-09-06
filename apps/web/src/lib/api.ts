import { getSupabaseBrowserClient } from "./supabase";

const LOCAL_API_URL = "http://localhost:8010";

export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || LOCAL_API_URL).replace(/\/$/, "");
}

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || LOCAL_API_URL
).replace(/\/$/, "");

export class AuthRequiredError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export function apiUrl(path: string) {
  const base = getApiBaseUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;
let pendingTokenPromise: Promise<string | null> | null = null;

export async function getAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAtMs - now > 60_000) {
    return cachedAccessToken.token;
  }

  if (pendingTokenPromise) {
    return pendingTokenPromise;
  }

  pendingTokenPromise = (async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return null;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        cachedAccessToken = null;
        return null;
      }

      const expiresAtMs = session.expires_at ? session.expires_at * 1000 : now + 3600_000;
      if (expiresAtMs - now < 60_000) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshed.session?.access_token) {
          const refExpires = refreshed.session.expires_at ? refreshed.session.expires_at * 1000 : now + 3600_000;
          cachedAccessToken = { token: refreshed.session.access_token, expiresAtMs: refExpires };
          return refreshed.session.access_token;
        }
      }

      cachedAccessToken = { token: session.access_token, expiresAtMs };
      return session.access_token;
    } catch (err) {
      console.warn('[api]: Failed to get session token:', err);
      return null;
    } finally {
      pendingTokenPromise = null;
    }
  })();

  return pendingTokenPromise;
}

export async function authHeaders(init?: HeadersInit): Promise<Headers> {
  const headers = new Headers(init);
  const token = await getAccessToken();

  // Temporarily bypass frontend auth check for live testing
  // if (!token) {
  //   throw new AuthRequiredError();
  // }

  headers.set("Authorization", `Bearer ${token || 'mock-token'}`);
  return headers;
}

/**
 * @deprecated Use authHeaders() or authFetch() so requests carry the Supabase JWT.
 */
export function authorizedHeaders(headers?: HeadersInit) {
  console.warn(
    "[api]: authorizedHeaders() is deprecated and does not attach a user JWT. Use authFetch() instead.",
  );
  return new Headers(headers);
}

export async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = await authHeaders(init?.headers);
  return fetch(apiUrl(path), { ...init, headers });
}

const playUrlMemoryCache = new Map<string, { url: string; expiresAt: number }>();

export async function getClipPlayUrl(clipId: string): Promise<string> {
  const cached = playUrlMemoryCache.get(clipId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const response = await authFetch(`/api/video/play-token/${clipId}`, { method: "POST" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create play URL");
  }

  const playUrl = data.playUrl as string;
  const fullUrl = playUrl.startsWith("http") ? playUrl : apiUrl(playUrl);
  playUrlMemoryCache.set(clipId, { url: fullUrl, expiresAt: Date.now() + 8 * 60 * 1000 });
  return fullUrl;
}

/**
 * Gets a short-lived direct download URL for a clip.
 * The browser opens this URL natively — no blob buffering needed.
 * The API sets Content-Disposition: attachment with the correct filename.
 */
export async function getDirectDownloadUrl(clipId: string): Promise<string> {
  const response = await authFetch(`/api/video/download-token/${clipId}`, { method: "POST" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create download URL");
  }

  const downloadUrl = data.downloadUrl as string;
  if (downloadUrl.startsWith("http")) return downloadUrl;
  return apiUrl(downloadUrl);
}

export async function downloadAuthenticatedClip(
  clipId: string,
  fileName: string,
  queryParams?: Record<string, string>,
): Promise<void> {
  const search = new URLSearchParams(queryParams);
  const path = `/api/video/download/${clipId}${search.toString() ? `?${search.toString()}` : ""}`;

  const response = await authFetch(path);

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Download failed (HTTP ${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  // Force video/mp4 MIME type so the browser always saves as a playable file.
  const blob = new Blob([arrayBuffer], { type: "video/mp4" });
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();

  // Defer cleanup so the browser has time to start the download
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }, 5000);
}

export type ApiResult<T> =
  | { success: true; data: T; error?: never }
  | { success: false; error: { statusCode: number; message: string }; data?: never };

export const apiClient = {
  createJob: async (videoUrl: string, numClips: number = 3): Promise<ApiResult<any>> => {
    try {
      const response = await authFetch("/api/video/generate-clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl, numClips }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          success: false,
          error: {
            statusCode: response.status,
            message: data.error || (data.errors ? data.errors.map((e: any) => e.msg).join(", ") : `Request failed with status ${response.status}`),
          },
        };
      }
      return { success: true, data: { id: data.jobId, ...data } };
    } catch (err: any) {
      return {
        success: false,
        error: { statusCode: 500, message: err.message || "Network error occurred" },
      };
    }
  },
};

export const isPurgeEnabled =
  process.env.NEXT_PUBLIC_ENABLE_PURGE === "true" ||
  process.env.NODE_ENV !== "production";
