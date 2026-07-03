import { type Types } from "mongoose";
import { ulid } from "ulid";
import { env } from "@/config/env.js";
import { randomToken, sha256 } from "@/lib/crypto.js";
import { SessionModel } from "@/models/index.js";

export interface NewSession {
  sessionId: string;
  rawRefreshToken: string;
  family: string;
  expiresAt: Date;
}

function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000);
}

export async function createSession(params: {
  userId: Types.ObjectId;
  companyId: Types.ObjectId | null;
  ip: string;
  userAgent: string;
  amr: string[];
  family?: string;
}): Promise<NewSession> {
  const rawRefreshToken = randomToken(32);
  const family = params.family ?? ulid();
  const expiresAt = refreshExpiry();
  const doc = await SessionModel.create({
    userId: params.userId,
    companyId: params.companyId ?? null,
    refreshHash: sha256(rawRefreshToken),
    family,
    userAgent: params.userAgent,
    ip: params.ip,
    lastSeenAt: new Date(),
    expiresAt,
    amr: params.amr,
  });
  return { sessionId: String(doc._id), rawRefreshToken, family, expiresAt };
}

export type RotateResult =
  | {
      ok: true;
      sessionId: string;
      userId: Types.ObjectId;
      companyId: Types.ObjectId | null;
      rawRefreshToken: string;
      expiresAt: Date;
    }
  | { ok: false; reason: "not_found" | "expired" | "reuse" };

/** Rotate a refresh token; detect reuse of an already-rotated token (theft). */
export async function rotateSession(rawToken: string, ctx: { ip: string; userAgent: string }): Promise<RotateResult> {
  const existing = await SessionModel.findOne({ refreshHash: sha256(rawToken) });
  if (!existing) return { ok: false, reason: "not_found" };

  if (existing.revokedAt) {
    // Reuse of a rotated/revoked token → revoke the entire family.
    await SessionModel.updateMany(
      { family: existing.family, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    return { ok: false, reason: "reuse" };
  }
  if (existing.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  const rawRefreshToken = randomToken(32);
  const expiresAt = refreshExpiry();
  const next = await SessionModel.create({
    userId: existing.userId,
    companyId: existing.companyId,
    refreshHash: sha256(rawRefreshToken),
    family: existing.family,
    userAgent: ctx.userAgent,
    ip: ctx.ip,
    lastSeenAt: new Date(),
    expiresAt,
    amr: existing.amr,
  });

  existing.revokedAt = new Date();
  existing.replacedBySessionId = next._id;
  await existing.save();

  return {
    ok: true,
    sessionId: String(next._id),
    userId: next.userId,
    companyId: next.companyId ?? null,
    rawRefreshToken,
    expiresAt,
  };
}

export async function revokeSessionByToken(rawToken: string): Promise<void> {
  await SessionModel.updateOne(
    { refreshHash: sha256(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeAllSessions(userId: Types.ObjectId): Promise<void> {
  await SessionModel.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

/** Revoke one of the user's sessions by id. Returns false if it wasn't theirs / not active. */
export async function revokeSessionById(userId: Types.ObjectId, sessionId: string): Promise<boolean> {
  const res = await SessionModel.updateOne(
    { _id: sessionId, userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return (res.matchedCount ?? 0) > 0;
}

/** Revoke all of the user's active sessions except the one to keep. Returns the count revoked. */
export async function revokeOtherSessions(userId: Types.ObjectId, keepSessionId: string): Promise<number> {
  const res = await SessionModel.updateMany(
    { userId, revokedAt: null, _id: { $ne: keepSessionId } },
    { $set: { revokedAt: new Date() } },
  );
  return res.modifiedCount ?? 0;
}

export function listActiveSessions(userId: Types.ObjectId) {
  return SessionModel.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ lastSeenAt: -1 })
    .lean();
}
