import type { Types } from "mongoose";
import { getContext, tryGetContext } from "@/context/request-context.js";
import { AppError } from "@/lib/errors.js";
import { logger } from "@/lib/logger.js";
import { NotificationModel, UserModel } from "@/models/index.js";
import { sendMail } from "@/services/email.service.js";

export type NotificationKind = "usage" | "billing" | "key" | "sync" | "ticket" | "system";
export type NotificationSeverity = "info" | "success" | "warning" | "error";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/* ── Per-user notification preferences ──────────────────────────────────── */

export const NOTIFICATION_KINDS: NotificationKind[] = ["usage", "billing", "key", "sync", "ticket", "system"];

export interface KindPrefs {
  in_app: boolean;
  email: boolean;
}
export interface NotificationPrefs {
  email_enabled: boolean;
  kinds: Record<NotificationKind, KindPrefs>;
}

/** Email defaults: on for money/support/system events, off for chatty ones. */
const EMAIL_DEFAULT: Record<NotificationKind, boolean> = {
  usage: false,
  billing: true,
  key: false,
  sync: false,
  ticket: true,
  system: true,
};

export function defaultPrefs(): NotificationPrefs {
  return {
    email_enabled: true,
    kinds: Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, { in_app: true, email: EMAIL_DEFAULT[k] }])) as Record<
      NotificationKind,
      KindPrefs
    >,
  };
}

/** Merge whatever is stored (possibly partial/legacy) onto the defaults. */
function resolvePrefs(stored: unknown): NotificationPrefs {
  const prefs = defaultPrefs();
  if (!stored || typeof stored !== "object") return prefs;
  const s = stored as Partial<NotificationPrefs>;
  if (typeof s.email_enabled === "boolean") prefs.email_enabled = s.email_enabled;
  if (s.kinds && typeof s.kinds === "object") {
    for (const k of NOTIFICATION_KINDS) {
      const v = (s.kinds as Record<string, Partial<KindPrefs>>)[k];
      if (v && typeof v === "object") {
        if (typeof v.in_app === "boolean") prefs.kinds[k].in_app = v.in_app;
        if (typeof v.email === "boolean") prefs.kinds[k].email = v.email;
      }
    }
  }
  return prefs;
}

export async function getNotificationPrefs() {
  const { userId } = getContext();
  const user = await UserModel.findById(userId).select("notificationPrefs").lean();
  return { preferences: resolvePrefs(user?.notificationPrefs) };
}

export async function updateNotificationPrefs(patch: {
  email_enabled?: boolean;
  kinds?: Partial<Record<NotificationKind, Partial<KindPrefs>>>;
}) {
  const { userId } = getContext();
  const user = await UserModel.findById(userId).select("notificationPrefs");
  if (!user) throw AppError.notFound("User not found");
  const merged = resolvePrefs(user.notificationPrefs);
  if (patch.email_enabled !== undefined) merged.email_enabled = patch.email_enabled;
  if (patch.kinds) {
    for (const k of NOTIFICATION_KINDS) {
      const v = patch.kinds[k];
      if (!v) continue;
      if (v.in_app !== undefined) merged.kinds[k].in_app = v.in_app;
      if (v.email !== undefined) merged.kinds[k].email = v.email;
    }
  }
  user.notificationPrefs = merged;
  user.markModified("notificationPrefs");
  await user.save();
  return { preferences: merged };
}

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
    const recipient = await UserModel.findById(input.recipientId).select("email name notificationPrefs status").lean();
    if (!recipient || recipient.status !== "active") return;
    const prefs = resolvePrefs(recipient.notificationPrefs);
    const kindPrefs = prefs.kinds[input.kind] ?? { in_app: true, email: false };
    if (!kindPrefs.in_app && !(prefs.email_enabled && kindPrefs.email)) return;

    const channels = [
      ...(kindPrefs.in_app ? ["in_app"] : []),
      ...(prefs.email_enabled && kindPrefs.email ? ["email"] : []),
    ];

    if (kindPrefs.in_app) {
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
        channels,
        expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
      });
    }

    if (prefs.email_enabled && kindPrefs.email) {
      const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
      // Fire-and-forget: an SMTP hiccup must never break the triggering action.
      void sendMail({
        to: recipient.email,
        subject: `[Postpin] ${input.title}`,
        text: `${input.title}\n\n${input.body ?? ""}\n\nManage notification preferences: /app/settings#notifications`,
        html: `<p><strong>${esc(input.title)}</strong></p><p>${esc(input.body ?? "")}</p><p style="color:#888;font-size:12px">You can change which events reach your inbox under Settings → Notification preferences.</p>`,
      }).catch((err: Error) => logger.warn({ err: err.message, type: input.type }, "notification email failed"));
    }
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
