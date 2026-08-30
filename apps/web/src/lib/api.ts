import { VideoJob } from '@excerpt/clipping-core';
import { ErrorType } from '../components/primitives/ErrorState';

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

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function getAccessToken(): Promise<string | null> {
  try {
    const { getFirebaseAuth } = await import("./firebase");
    const auth = getFirebaseAuth();
    if (auth?.currentUser) {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) return idToken;
    }
  } catch (err) {
    // Ignore and fallback
  }

  return null;
}

export async function authHeaders(init?: HeadersInit): Promise<Headers> {
  const headers = new Headers(init);
  const token = await getAccessToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
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
  const blob = new Blob([arrayBuffer], { type: "video/mp4" });
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();

  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }, 5000);
}

export const isPurgeEnabled =
  process.env.NEXT_PUBLIC_ENABLE_PURGE === "true" ||
  process.env.NODE_ENV !== "production";

export interface ApiError {
  type: ErrorType;
  message: string;
  statusCode?: number;
  rawDetails?: unknown;
}

export type Result<T> = 
  | { success: true; data: T; error?: undefined }
  | { success: false; error: ApiError; data?: undefined };

export class ExcerptApiClient {
  private baseUrl: string;

  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<Result<T>> {
    try {
      const response = await authFetch(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            error: {
              type: 'AUTH_RLS_DENIED',
              message: 'Authentication failed or resource access denied by RLS policy.',
              statusCode: response.status
            }
          };
        }

        return {
          success: false,
          error: {
            type: 'SERVER_ERROR',
            message: `Server returned error status ${response.status}`,
            statusCode: response.status
          }
        };
      }

      const data = await response.json();
      return { success: true, data };

    } catch (err: any) {
      if (err instanceof SyntaxError) {
        return {
          success: false,
          error: {
            type: 'UNKNOWN',
            message: 'Failed to parse JSON response payload from backend.',
            rawDetails: err
          }
        };
      }

      return {
        success: false,
        error: {
          type: 'NETWORK_ERROR',
          message: err?.message || 'Network fetch failure encountered.',
          rawDetails: err
        }
      };
    }
  }

  async getJob(jobId: string): Promise<Result<VideoJob>> {
    return this.request<VideoJob>(`/jobs/${jobId}`);
  }

  async listJobs(): Promise<Result<VideoJob[]>> {
    return this.request<VideoJob[]>('/jobs');
  }

  async createJob(inputUrl: string, requestedClips: number): Promise<Result<VideoJob>> {
    return this.request<VideoJob>('/jobs', {
      method: 'POST',
      body: JSON.stringify({ inputUrl, requestedClips })
    });
  }
}

export const apiClient = new ExcerptApiClient();
