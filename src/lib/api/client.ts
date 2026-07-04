import { ApiError } from "@/lib/api/errors";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

// Access token lives in memory (not a cookie) — XSS-safer; refreshed from the
// HttpOnly refresh cookie on the API origin.
let accessToken: string | null = null;
export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}

// Single-flight refresh: many concurrent 401s trigger only one /auth/refresh.
let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const csrf = readCookie("pp_csrf");
      if (!csrf) return false;
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "x-csrf-token": csrf },
        });
        if (!res.ok) return false;
        const data = (await res.json()) as { access_token?: string };
        if (!data.access_token) return false;
        accessToken = data.access_token;
        return true;
      } catch {
        return false;
      }
    })();
  }
  const result = await refreshing;
  refreshing = null;
  return result;
}

/** Run the single-flight refresh (for non-JSON fetches like file downloads). */
export function refreshAccessToken(): Promise<boolean> {
  return tryRefresh();
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  noRetry?: boolean;
}

export async function apiFetch<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, noRetry, headers: hdrs, method = "GET", ...rest } = opts;

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const build = () => {
    const headers = new Headers(hdrs as HeadersInit | undefined);
    if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
    // FormData sets its own multipart content-type (with boundary) — don't override it.
    if (body !== undefined && !isFormData && !headers.has("content-type")) headers.set("content-type", "application/json");
    if (method !== "GET" && method !== "HEAD") {
      const csrf = readCookie("pp_csrf");
      if (csrf) headers.set("x-csrf-token", csrf);
    }
    return fetch(`${API_BASE}${path}`, {
      ...rest,
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
    });
  };

  let res = await build();
  if (res.status === 401 && !noRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) res = await build();
  }
  if (!res.ok) throw await ApiError.fromResponse(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
