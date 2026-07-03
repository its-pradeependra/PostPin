import type { Types } from "mongoose";
import { AuditLogModel } from "@/models/index.js";
import { tryGetContext } from "@/context/request-context.js";
import { logger } from "@/lib/logger.js";

export interface AuditEntry {
  action: string; // verb.noun, e.g. "auth.login"
  category: "billing" | "security" | "config" | "data" | "support" | "pincode" | "auth";
  actorType?: "user" | "admin" | "system" | "api";
  actorId?: Types.ObjectId | null;
  actorEmail?: string | null;
  companyId?: Types.ObjectId | null;
  resource?: { kind?: string; id?: string; name?: string };
  outcome?: "success" | "failure" | "denied";
  severity?: "info" | "notice" | "warning" | "critical";
  changes?: Array<{ field: string; before?: unknown; after?: unknown }>;
  metadata?: Record<string, unknown>;
}

/** Append an immutable audit record. Best-effort: never throws into the caller. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  const ctx = tryGetContext();
  try {
    await AuditLogModel.create({
      at: new Date(),
      actorType: entry.actorType ?? (ctx?.isPlatformStaff ? "admin" : ctx?.userId ? "user" : "system"),
      actorId: entry.actorId ?? ctx?.userId ?? null,
      actorEmail: entry.actorEmail ?? null,
      companyId: entry.companyId ?? ctx?.companyId ?? null,
      action: entry.action,
      category: entry.category,
      resource: entry.resource ?? {},
      outcome: entry.outcome ?? "success",
      severity: entry.severity ?? "info",
      changes: entry.changes ?? [],
      requestId: ctx?.requestId ?? null,
      sessionId: ctx?.sessionId ?? null,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      metadata: entry.metadata ?? {},
    });
  } catch (err) {
    logger.error({ err: (err as Error).message, action: entry.action }, "audit write failed");
  }
}
