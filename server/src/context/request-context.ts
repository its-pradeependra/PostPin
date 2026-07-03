import { AsyncLocalStorage } from "node:async_hooks";
import type { Types } from "mongoose";

/**
 * Immutable per-request identity & tenant context.
 * `companyId` is resolved ONCE (from the verified JWT / API key) and is never
 * read from the request body or query — the foundation of tenant isolation.
 */
export interface RequestContext {
  requestId: string;
  userId: Types.ObjectId | null;
  companyId: Types.ObjectId | null;
  roleKey: string | null;
  isPlatformStaff: boolean;
  permissions: Set<string>;
  permVersion: number;
  sessionId: string | null;
  ip: string;
  userAgent: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Establish a fresh, empty per-request context at the very start of the request
 * (onRequest hook). Binding the store at the request's async root makes it
 * visible to every later hook + the handler, and isolates it per request. */
export function startContext(seed: { requestId: string; ip: string; userAgent: string }): void {
  storage.enterWith({
    requestId: seed.requestId,
    userId: null,
    companyId: null,
    roleKey: null,
    isPlatformStaff: false,
    permissions: new Set<string>(),
    permVersion: 0,
    sessionId: null,
    ip: seed.ip,
    userAgent: seed.userAgent,
  });
}

/** Fill in the per-request context (mutates the existing store object in place). */
export function setContext(patch: Partial<RequestContext>): void {
  const ctx = storage.getStore();
  if (!ctx) throw new Error("Request context not started");
  Object.assign(ctx, patch);
}

export function tryGetContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error("No request context — this code ran outside an authenticated request scope");
  }
  return ctx;
}

export function hasPermission(key: string): boolean {
  return getContext().permissions.has(key);
}
