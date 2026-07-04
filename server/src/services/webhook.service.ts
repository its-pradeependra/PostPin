import type { Types } from "mongoose";
import { getContext } from "@/context/request-context.js";
import { isProd, isTest } from "@/config/env.js";
import { hmacSha256, randomToken } from "@/lib/crypto.js";
import { AppError } from "@/lib/errors.js";
import { logger } from "@/lib/logger.js";
import { WebhookModel, WebhookDeliveryModel } from "@/models/index.js";
import { scopedRepo } from "@/tenancy/scoped-repo.js";
import { writeAudit } from "@/services/audit.service.js";

/** The events a tenant can subscribe an endpoint to. */
export const WEBHOOK_EVENTS = [
  "rate.calculated",
  "key.created",
  "key.revoked",
  "subscription.updated",
  "invoice.paid",
  "sync.completed",
  "sync.failed",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const MAX_ENDPOINTS = 10;
const DELIVERY_TIMEOUT_MS = 8_000;

/** Lean projections — scopedRepo over `Model<any>` returns an ambiguous union, so
 * we assert the concrete shape at the `.lean()` boundary. */
interface WebhookLean {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  url: string;
  events: string[];
  status: "active" | "paused" | "disabled";
  description?: string | null;
  signingSecret: string;
  lastDeliveryAt?: Date | null;
  successRate?: number;
  createdAt: Date;
}
interface DeliveryLean {
  _id: Types.ObjectId;
  webhookId: Types.ObjectId;
  event?: string;
  attempt?: number;
  requestBody?: unknown;
}

function genSigningSecret(): string {
  return `whsec_${randomToken(24)}`;
}

function maskSecret(secret: string): string {
  return `whsec_${"•".repeat(8)}${secret.slice(-4)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDto(w: any) {
  return {
    id: String(w._id),
    url: w.url,
    events: w.events ?? [],
    status: w.status,
    description: w.description ?? null,
    secret_masked: maskSecret(w.signingSecret),
    last_delivery_at: w.lastDeliveryAt ?? null,
    success_rate: (w.successRate ?? 100) / 100,
    created_at: w.createdAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deliveryDto(d: any) {
  return {
    id: String(d._id),
    webhook_id: String(d.webhookId),
    event: d.event ?? "",
    status: d.statusCode ?? 0,
    ok: d.ok ?? false,
    attempt: d.attempt ?? 1,
    duration_ms: d.durationMs ?? 0,
    at: d.createdAt,
  };
}

/**
 * Basic SSRF guard: in production, refuse to deliver to loopback / link-local /
 * RFC-1918 private ranges so a tenant can't use webhooks to probe our internal
 * network. In dev/test we allow them so local receivers can be exercised.
 */
function assertDeliverable(rawUrl: string): void {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    throw AppError.badRequest("Invalid endpoint URL");
  }
  if (!isProd) return;
  const blocked =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host === "0.0.0.0" ||
    host === "::1";
  if (blocked) throw AppError.badRequest("Endpoint host is not allowed");
}

export const WEBHOOK_ENDPOINT_CAP = MAX_ENDPOINTS;

export async function listWebhooks() {
  const rows = await scopedRepo(WebhookModel).find().sort({ createdAt: -1 }).lean();
  return rows.map(toDto);
}

export async function createWebhook(input: { url: string; events: string[]; description?: string }) {
  const ctx = getContext();
  assertDeliverable(input.url);
  const active = await scopedRepo(WebhookModel).countDocuments({ status: { $ne: "disabled" } });
  if (active >= MAX_ENDPOINTS) {
    throw AppError.conflict(`You can register up to ${MAX_ENDPOINTS} endpoints. Remove one to add another.`, "webhook_limit");
  }
  const secret = genSigningSecret();
  const doc = await scopedRepo(WebhookModel).create({
    url: input.url,
    events: input.events,
    signingSecret: secret,
    description: input.description ?? undefined,
    status: "active",
    successRate: 100,
    createdByUserId: ctx.userId,
  });
  await writeAudit({
    action: "webhook.created",
    category: "config",
    resource: { kind: "webhook", id: String(doc._id), name: input.url },
  });
  // The signing secret is returned exactly once, in full.
  return { secret, webhook: toDto(doc) };
}

export async function updateWebhook(
  id: string,
  patch: { url?: string; events?: string[]; description?: string; status?: "active" | "paused" | "disabled" },
) {
  if (patch.url !== undefined) assertDeliverable(patch.url);
  const set: Record<string, unknown> = {};
  if (patch.url !== undefined) set.url = patch.url;
  if (patch.events !== undefined) set.events = patch.events;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.status !== undefined) set.status = patch.status;
  const res = await scopedRepo(WebhookModel).findByIdAndUpdate(id, { $set: set });
  if (!res) throw AppError.notFound("Endpoint not found");
  await writeAudit({ action: "webhook.updated", category: "config", resource: { kind: "webhook", id } });
  return toDto(res);
}

export async function rollSecret(id: string) {
  const existing = await scopedRepo(WebhookModel).findById(id);
  if (!existing) throw AppError.notFound("Endpoint not found");
  const secret = genSigningSecret();
  existing.signingSecret = secret;
  await existing.save();
  await writeAudit({ action: "webhook.secret_rolled", category: "security", severity: "warning", resource: { kind: "webhook", id } });
  return { secret, webhook: toDto(existing) };
}

export async function deleteWebhook(id: string) {
  const res = await scopedRepo(WebhookModel).findByIdAndDelete(id);
  if (!res) throw AppError.notFound("Endpoint not found");
  await scopedRepo(WebhookDeliveryModel).deleteMany({ webhookId: res._id });
  await writeAudit({ action: "webhook.deleted", category: "config", severity: "warning", resource: { kind: "webhook", id, name: res.url } });
  return { ok: true };
}

/** Recompute a webhook's rolling success-rate (%) from its recorded deliveries.
 * Context-free (keyed by the hook's own companyId) so cron paths can use it. */
async function refreshSuccessRate(companyId: Types.ObjectId, webhookId: Types.ObjectId): Promise<void> {
  const [total, ok] = await Promise.all([
    WebhookDeliveryModel.countDocuments({ companyId, webhookId }),
    WebhookDeliveryModel.countDocuments({ companyId, webhookId, ok: true }),
  ]);
  const rate = total === 0 ? 100 : Math.round((ok / total) * 100);
  await WebhookModel.findOneAndUpdate({ _id: webhookId, companyId }, { $set: { successRate: rate, lastDeliveryAt: new Date() } });
}

/**
 * Perform ONE outbound delivery attempt to the endpoint, sign it, record the
 * attempt, and return the delivery DTO. Never throws on a network/HTTP failure —
 * the failure is captured as a delivery record with ok:false.
 */
async function dispatch(webhook: WebhookLean, event: string, data: unknown, attempt = 1) {
  const eventId = `evt_${randomToken(9)}`;
  const payload = { id: eventId, event, created: new Date().toISOString(), data };
  const rawBody = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const signature = `t=${ts},v1=${hmacSha256(`${ts}.${rawBody}`, webhook.signingSecret)}`;

  const started = Date.now();
  let statusCode = 0;
  let ok = false;
  let responseBody = "";
  let error = "";

  try {
    assertDeliverable(webhook.url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Postpin-Webhooks/1.0",
          "x-postpin-event": event,
          "x-postpin-event-id": eventId,
          "x-postpin-signature": signature,
        },
        body: rawBody,
        signal: controller.signal,
      });
      statusCode = res.status;
      ok = res.ok;
      responseBody = (await res.text().catch(() => "")).slice(0, 2000);
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    error = e instanceof Error ? (e.name === "AbortError" ? "Request timed out" : e.message) : "Delivery failed";
    ok = false;
    statusCode = 0;
  }

  const durationMs = Date.now() - started;
  const record = await WebhookDeliveryModel.create({
    companyId: webhook.companyId,
    webhookId: webhook._id,
    eventId,
    event,
    status: ok ? "delivered" : "failed",
    ok,
    statusCode,
    durationMs,
    attempt,
    requestBody: payload,
    responseBody,
    error: error || undefined,
    createdAt: new Date(),
  });
  await refreshSuccessRate(webhook.companyId, webhook._id).catch((err) =>
    logger.warn({ err: (err as Error).message }, "webhook success-rate refresh failed"),
  );
  return deliveryDto(record);
}

// ── Real event emission ───────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 2_000, 10_000]; // per attempt (index 0 unused-ish)

/** Deliver to one endpoint with retry + backoff. Never throws. */
async function deliverWithRetry(webhook: WebhookLean, event: WebhookEvent, data: unknown): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await new Promise((r) => setTimeout(r, isTest ? 1 : BACKOFF_MS[attempt - 1]));
    }
    try {
      const delivery = await dispatch(webhook, event, data, attempt);
      if (delivery.ok) return;
    } catch (err) {
      logger.warn({ err: (err as Error).message, event, url: webhook.url }, "webhook delivery attempt errored");
    }
  }
}

/**
 * Emit a real product event to every ACTIVE endpoint of a company subscribed to
 * it. Context-free and fire-and-forget safe — call sites use `void emit…`.
 */
export async function emitWebhookEvent(
  companyId: Types.ObjectId | string | null | undefined,
  event: WebhookEvent,
  data: unknown,
): Promise<void> {
  if (!companyId) return;
  try {
    const hooks = (await WebhookModel.find({ companyId, status: "active", events: event }).lean()) as unknown as WebhookLean[];
    await Promise.all(hooks.map((h) => deliverWithRetry(h, event, data)));
  } catch (err) {
    logger.warn({ err: (err as Error).message, event }, "webhook event emission failed");
  }
}

/** Emit a platform-wide event (e.g. pincode sync) to every subscribed tenant. */
export async function emitWebhookEventToAll(event: WebhookEvent, data: unknown): Promise<void> {
  try {
    const hooks = (await WebhookModel.find({ status: "active", events: event }).lean()) as unknown as WebhookLean[];
    await Promise.all(hooks.map((h) => deliverWithRetry(h, event, data)));
  } catch (err) {
    logger.warn({ err: (err as Error).message, event }, "webhook broadcast failed");
  }
}

/** Fire a synthetic `ping`-style test delivery to an endpoint on demand. */
export async function testWebhook(id: string) {
  const webhook = (await scopedRepo(WebhookModel).findById(id).lean()) as WebhookLean | null;
  if (!webhook) throw AppError.notFound("Endpoint not found");
  const delivery = await dispatch(webhook, "rate.calculated", {
    test: true,
    message: "This is a test event from Postpin.",
    origin: "110001",
    destination: "560001",
  });
  await writeAudit({ action: "webhook.tested", category: "config", resource: { kind: "webhook", id } });
  return { delivery };
}

export async function listDeliveries(limit: number, webhookId?: string) {
  const filter = webhookId ? { webhookId } : {};
  const rows = await scopedRepo(WebhookDeliveryModel)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .lean();
  return rows.map(deliveryDto);
}

/** Re-send a past delivery's payload as a fresh attempt. */
export async function replayDelivery(deliveryId: string) {
  const original = (await scopedRepo(WebhookDeliveryModel).findById(deliveryId).lean()) as DeliveryLean | null;
  if (!original) throw AppError.notFound("Delivery not found");
  const webhook = (await scopedRepo(WebhookModel).findById(original.webhookId).lean()) as WebhookLean | null;
  if (!webhook) throw AppError.notFound("Endpoint no longer exists");
  const data =
    original.requestBody && typeof original.requestBody === "object" && "data" in original.requestBody
      ? (original.requestBody as { data: unknown }).data
      : original.requestBody;
  const delivery = await dispatch(webhook, original.event ?? "rate.calculated", data, (original.attempt ?? 1) + 1);
  await writeAudit({ action: "webhook.replayed", category: "config", resource: { kind: "webhook", id: String(webhook._id) } });
  return { delivery };
}
