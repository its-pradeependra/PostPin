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
