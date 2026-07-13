import { VERSION } from "./version.js";
import { ConnectionError, PostpinError, TimeoutError, errorFromResponse } from "./errors.js";
import type { ResponseMeta } from "./types.js";

/** Minimal fetch signature so a custom `fetch` (undici, node-fetch, proxy) can be injected. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** Override the API base URL, INCLUDING the version prefix. Default: https://api.postpin.in/v1 */
  baseUrl?: string;
  /** Per-request timeout in ms (aborts the request). Default: 30000. */
  timeout?: number;
  /** Max automatic retries on 429 / 5xx / network errors. Default: 2. */
  maxRetries?: number;
  /** Provide a custom fetch (e.g. for Node < 18, a proxy agent, or tests). */
  fetch?: FetchLike;
  /** Extra headers sent on every request. */
  headers?: Record<string, string>;
}

interface RequestConfig {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Explicit idempotency key; auto-generated for POST when omitted. */
  idempotencyKey?: string;
  /** Caller cancellation signal (composed with the timeout signal). */
  signal?: AbortSignal;
}

interface Envelope<T> {
  data: T;
  meta: ResponseMeta;
}

const DEFAULT_BASE_URL = "https://api.postpin.in/v1";
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function uuid(): string {
  // Node 18+ / modern runtimes expose crypto.randomUUID globally.
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // Fallback (non-crypto) — only used on exotic runtimes.
  return "idem-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: FetchLike;
  private readonly extraHeaders: Record<string, string>;

  constructor(apiKey: string, options: ClientOptions = {}) {
    if (!apiKey || typeof apiKey !== "string") {
      throw new PostpinError("A Postpin API key is required to create a client.", {
        code: "missing_api_key",
      });
    }
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = options.timeout ?? 30_000;
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.extraHeaders = options.headers ?? {};

    const injected = options.fetch;
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
    const resolved = injected ?? globalFetch;
    if (!resolved) {
      throw new PostpinError(
        "No global fetch available. Use Node 18+ or pass a `fetch` implementation in the client options.",
        { code: "no_fetch" },
      );
    }
    this.fetchImpl = resolved;
  }

  private buildUrl(path: string, query?: RequestConfig["query"]): string {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private headersFor(cfg: RequestConfig): Record<string, string> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      accept: "application/json",
      "user-agent": `postpin-node/${VERSION}`,
      "x-postpin-client": `postpin-node/${VERSION}`,
      ...this.extraHeaders,
    };
    if (cfg.body !== undefined) {
      headers["content-type"] = "application/json";
      // Idempotency lets us safely retry POSTs without duplicating side effects.
      headers["idempotency-key"] = cfg.idempotencyKey ?? uuid();
    }
    return headers;
  }

  /** Compose the caller's abort signal with a per-attempt timeout signal. */
  private timeoutSignal(external?: AbortSignal): { signal: AbortSignal; done: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new TimeoutError(`Request timed out after ${this.timeout}ms`, { code: "timeout" })), this.timeout);
    const onAbort = () => controller.abort(external?.reason);
    if (external) {
      if (external.aborted) controller.abort(external.reason);
      else external.addEventListener("abort", onAbort, { once: true });
    }
    return {
      signal: controller.signal,
      done: () => {
        clearTimeout(timer);
        external?.removeEventListener("abort", onAbort);
      },
    };
  }

  async request<T>(cfg: RequestConfig): Promise<Envelope<T>> {
    const url = this.buildUrl(cfg.path, cfg.query);
    const headers = this.headersFor(cfg);
    const bodyStr = cfg.body !== undefined ? JSON.stringify(cfg.body) : undefined;
    // A POST is only auto-retried because it carries an idempotency key.
    const retryable = cfg.method === "GET" || headers["idempotency-key"] !== undefined;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const { signal, done } = this.timeoutSignal(cfg.signal);
      let response: Response;
      try {
        response = await this.fetchImpl(url, { method: cfg.method, headers, body: bodyStr, signal });
      } catch (err) {
        done();
        // Distinguish a timeout/caller-abort from a genuine network failure.
        if ((err as { name?: string })?.name === "AbortError" || err instanceof TimeoutError) {
          if (cfg.signal?.aborted) throw err instanceof PostpinError ? err : new PostpinError("Request aborted", { cause: err });
          lastError = err instanceof TimeoutError ? err : new TimeoutError(`Request timed out after ${this.timeout}ms`, { code: "timeout", cause: err });
        } else {
          lastError = new ConnectionError(`Network request to Postpin failed: ${(err as Error)?.message ?? "unknown error"}`, { code: "connection_error", cause: err });
        }
        if (retryable && attempt < this.maxRetries) {
          await sleep(this.backoff(attempt));
          continue;
        }
        throw lastError;
      }
      done();

      const rawHeaders = headersToObject(response.headers);
      const parsed = await parseBody(response);

      if (response.ok) {
        return normalizeEnvelope<T>(parsed);
      }

      // Retry transient statuses if we still have budget and the method is safe.
      if (retryable && RETRYABLE_STATUS.has(response.status) && attempt < this.maxRetries) {
        const retryAfter = Number(rawHeaders["retry-after"]);
        await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : this.backoff(attempt));
        lastError = errorFromResponse(response.status, parsed, rawHeaders);
        continue;
      }
      throw errorFromResponse(response.status, parsed, rawHeaders);
    }
    // Exhausted retries.
    throw lastError instanceof PostpinError
      ? lastError
      : new PostpinError("Request failed after retries", { cause: lastError });
  }

  /** Exponential backoff with full jitter, capped at 8s. */
  private backoff(attempt: number): number {
    const base = Math.min(8000, 500 * 2 ** attempt);
    return Math.floor(Math.random() * base);
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeEnvelope<T>(parsed: unknown): Envelope<T> {
  const obj = (parsed ?? {}) as { data?: unknown; meta?: ResponseMeta };
  // All Postpin success responses are `{ data, meta }`; be tolerant of a bare body.
  const data = (obj.data !== undefined ? obj.data : obj) as T;
  const meta = (obj.meta ?? { request_id: "" }) as ResponseMeta;
  return { data, meta };
}
