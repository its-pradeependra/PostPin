import type { Types } from "mongoose";
import { getContext, tryGetContext } from "@/context/request-context.js";
import { AppError } from "@/lib/errors.js";
import { logger } from "@/lib/logger.js";
import { NotificationModel } from "@/models/index.js";

export type NotificationKind = "usage" | "billing" | "key" | "sync" | "ticket" | "system";
export type NotificationSeverity = "info" | "success" | "warning" | "error";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Emit an in-app notification to a user. Best-effort: never throws into the
 * caller (a failed notification must not break the action that triggered it).
 * Notifications are PER-USER (recipientId); companyId is carried for context.
 */
export async function createNotification(input: {
  recipientId: Types.ObjectId | null | undefined;
  companyId?: Types.ObjectId | null;
  kind: NotificationKind;
  type: string;
  title: string;
  body?: string;
  severity?: NotificationSeverity;
  actionUrl?: string;
  data?: unknown;
}): Promise<void> {
  if (!input.recipientId) return;
  const ctx = tryGetContext();
  try {
    await NotificationModel.create({
      recipientId: input.recipientId,
      companyId: input.companyId ?? ctx?.companyId ?? null,
      kind: input.kind,
      type: input.type,
      title: input.title,
      body: input.body ?? "",
      severity: input.severity ?? "info",
      actionUrl: input.actionUrl ?? null,
      data: input.data,
      channels: ["in_app"],
      expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, type: input.type }, "notification create failed");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dto(n: any) {
  return {
    id: String(n._id),
    kind: n.kind as NotificationKind,
    title: n.title,
    body: n.body ?? "",
    read: Boolean(n.readAt),
    at: n.createdAt,
  };
}

export async function listNotifications(limit = 50, offset = 0, unreadOnly = false) {
  const { userId } = getContext();
  const base = { recipientId: userId };
  const filter: Record<string, unknown> = { ...base };
  if (unreadOnly) filter.readAt = null;
  const [rows, total, unread] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(Math.max(offset, 0))
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean(),
    NotificationModel.countDocuments(base),
    NotificationModel.countDocuments({ ...base, readAt: null }),
  ]);
  return { data: rows.map(dto), unreadCount: unread, total };
}

export async function markRead(id: string) {
  const { userId } = getContext();
  const res = await NotificationModel.findOneAndUpdate(
    { _id: id, recipientId: userId },
    { $set: { readAt: new Date(), seenAt: new Date() } },
    { new: true },
  );
  if (!res) throw AppError.notFound("Notification not found");
  return { notification: dto(res) };
}

export async function markAllRead() {
  const { userId } = getContext();
  const res = await NotificationModel.updateMany(
    { recipientId: userId, readAt: null },
    { $set: { readAt: new Date(), seenAt: new Date() } },
  );
  return { markedCount: res.modifiedCount ?? 0 };
}

export async function unreadCount() {
  const { userId } = getContext();
  return { unreadCount: await NotificationModel.countDocuments({ recipientId: userId, readAt: null }) };
}
