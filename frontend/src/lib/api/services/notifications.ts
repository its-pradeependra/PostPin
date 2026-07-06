import { apiFetch } from "@/lib/api/client";
import type { AppNotification } from "@/lib/types";

export type { AppNotification };

export interface NotificationsPage {
  data: AppNotification[];
  unreadCount: number;
  total: number;
}

export function listNotifications(limit = 50): Promise<NotificationsPage> {
  return apiFetch<NotificationsPage>(`/notifications?limit=${limit}`);
}

export function markNotificationRead(id: string) {
  return apiFetch<{ notification: AppNotification }>(`/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead() {
  return apiFetch<{ markedCount: number }>("/notifications/mark-all-read", { method: "POST" });
}

export function getUnreadCount() {
  return apiFetch<{ unreadCount: number }>("/notifications/unread-count");
}

/* ── Per-user channel preferences ─────────────────────────────────── */

export type NotificationKind = "usage" | "billing" | "key" | "sync" | "ticket" | "system";

export interface KindPrefs {
  in_app: boolean;
  email: boolean;
}

export interface NotificationPrefs {
  email_enabled: boolean;
  kinds: Record<NotificationKind, KindPrefs>;
}

export function getNotificationPrefs() {
  return apiFetch<{ preferences: NotificationPrefs }>("/notifications/preferences").then((r) => r.preferences);
}

export function updateNotificationPrefs(patch: {
  email_enabled?: boolean;
  kinds?: Partial<Record<NotificationKind, Partial<KindPrefs>>>;
}) {
  return apiFetch<{ preferences: NotificationPrefs }>("/notifications/preferences", {
    method: "PATCH",
    body: patch,
  }).then((r) => r.preferences);
}
