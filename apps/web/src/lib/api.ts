import { getSupabaseBrowserClient } from "./supabase";

const LOCAL_API_URL = "http://localhost:8010";

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
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
    if (expiresAtMs && expiresAtMs - Date.now() < 60_000) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshed.session?.access_token) {
        return refreshed.session.access_token;
      }
    }

    return session.access_token;
  } catch (err) {
    console.warn('[api]: Failed to get session token:', err);
    return null;
  }
}

export async function authHeaders(init?: HeadersInit): Promise<Headers> {
  const headers = new Headers(init);
  const token = await getAccessToken();

  if (!token) {
    throw new AuthRequiredError();
  }

  headers.set("Authorization", `Bearer ${token}`);
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

export async function getClipPlayUrl(clipId: string): Promise<string> {
  const response = await authFetch(`/api/video/play-token/${clipId}`, { method: "POST" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to create play URL");
  }

  const playUrl = data.playUrl as string;
  if (playUrl.startsWith("http")) return playUrl;
  return apiUrl(playUrl);
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

export const isPurgeEnabled =
  process.env.NEXT_PUBLIC_ENABLE_PURGE === "true" ||
  process.env.NODE_ENV !== "production";
