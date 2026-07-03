import { type Types } from "mongoose";
import { getContext } from "@/context/request-context.js";
import { env } from "@/config/env.js";
import { hmacSha256, randomToken } from "@/lib/crypto.js";
import { AppError } from "@/lib/errors.js";
import { ApiKeyModel, PlanModel, SubscriptionModel } from "@/models/index.js";
import { scopedRepo } from "@/tenancy/scoped-repo.js";
import { writeAudit } from "@/services/audit.service.js";
import { createNotification } from "@/services/notification.service.js";

type Mode = "live" | "test";

function genRaw(mode: Mode): string {
  return `pp_${mode}_${randomToken(24)}`;
}

function fingerprint(raw: string) {
  return {
    prefix: raw.slice(0, 16),
    last4: raw.slice(-4),
    hashedKey: hmacSha256(raw, env.API_KEY_PEPPER),
  };
}

export function hashIncomingKey(raw: string): string {
  return hmacSha256(raw, env.API_KEY_PEPPER);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDto(k: any) {
  return {
    id: String(k._id),
    name: k.name,
    prefix: k.prefix,
    last4: k.last4,
    masked: `${k.prefix}…${k.last4}`,
    mode: k.mode,
    status: k.status,
    allowed_domains: k.allowedDomains ?? [],
    last_used_at: k.lastUsedAt ?? null,
    request_count: k.requestCount ?? 0,
    created_at: k.createdAt,
  };
}

export async function listKeys() {
  const rows = await scopedRepo(ApiKeyModel).find().sort({ createdAt: -1 }).lean();
  return rows.map(toDto);
}

export async function getKey(id: string) {
  const doc = await scopedRepo(ApiKeyModel).findById(id).lean();
  if (!doc) throw AppError.notFound("API key not found");
  return toDto(doc);
}

async function planMaxKeys(companyId: Types.ObjectId): Promise<number> {
  const sub = await SubscriptionModel.findOne({ companyId, status: "active" }).lean();
  if (!sub) return 1;
  const plan = await PlanModel.findById(sub.planId).lean();
  return plan?.maxApiKeys ?? 1;
}

export async function createKey(input: { name: string; mode: Mode; allowedDomains?: string[] }) {
  const ctx = getContext();
  const max = await planMaxKeys(ctx.companyId!);
  const active = await scopedRepo(ApiKeyModel).countDocuments({ status: "active" });
  if (max !== -1 && active >= max) {
    throw AppError.conflict(`Your plan allows ${max} active API key${max === 1 ? "" : "s"}. Upgrade to add more.`, "key_limit");
  }

  const raw = genRaw(input.mode);
  const fp = fingerprint(raw);
  const doc = await scopedRepo(ApiKeyModel).create({
    name: input.name,
    mode: input.mode,
    prefix: fp.prefix,
    last4: fp.last4,
    hashedKey: fp.hashedKey,
    lookupId: fp.prefix,
    status: "active",
    allowedDomains: input.allowedDomains ?? [],
    createdByUserId: ctx.userId,
  });
  await writeAudit({ action: "apikey.created", category: "security", resource: { kind: "apiKey", id: String(doc._id), name: input.name } });
  await createNotification({
    recipientId: ctx.userId,
    kind: "key",
    type: "key.created",
    title: "New API key created",
    body: `"${input.name}" is ready to use.`,
    actionUrl: "/app/keys",
  });
  // The raw secret is returned exactly once.
  return { secret: raw, key: toDto(doc) };
}

export async function rotateKey(id: string) {
  const ctx = getContext();
  const existing = await scopedRepo(ApiKeyModel).findById(id);
  if (!existing || existing.status === "revoked") throw AppError.notFound("API key not found");
  const raw = genRaw(existing.mode as Mode);
  const fp = fingerprint(raw);
  existing.prefix = fp.prefix;
  existing.last4 = fp.last4;
  existing.hashedKey = fp.hashedKey;
  existing.lookupId = fp.prefix;
  await existing.save();
  await writeAudit({ action: "apikey.rotated", category: "security", severity: "warning", resource: { kind: "apiKey", id }, actorId: ctx.userId });
  return { secret: raw, key: toDto(existing) };
}

export async function revokeKey(id: string) {
  const ctx = getContext();
  const res = await scopedRepo(ApiKeyModel).findByIdAndUpdate(id, {
    $set: { status: "revoked", revokedAt: new Date(), revokedByUserId: ctx.userId },
  });
  if (!res) throw AppError.notFound("API key not found");
  await writeAudit({ action: "apikey.revoked", category: "security", severity: "warning", resource: { kind: "apiKey", id }, actorId: ctx.userId });
  await createNotification({
    recipientId: ctx.userId,
    kind: "key",
    type: "key.revoked",
    severity: "warning",
    title: "API key revoked",
    body: "An API key on your account was revoked and can no longer be used.",
    actionUrl: "/app/keys",
  });
  return { ok: true };
}

export async function updateKey(id: string, patch: { name?: string; allowedDomains?: string[] }) {
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.allowedDomains !== undefined) set.allowedDomains = patch.allowedDomains;
  const res = await scopedRepo(ApiKeyModel).findByIdAndUpdate(id, { $set: set });
  if (!res) throw AppError.notFound("API key not found");
  return toDto(res);
}
