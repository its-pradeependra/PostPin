import { apiFetch } from "@/lib/api/client";

export interface SessionDto {
  id: string;
  device: string;
  browser: string;
  location: string;
  ip: string;
  last_active_at: string;
  current: boolean;
}

export function updateProfile(patch: { name?: string; locale?: string; timezone?: string }) {
  return apiFetch<{ user: { id: string; name: string; email: string; locale: string; timezone: string } }>("/auth/profile", {
    method: "PATCH",
    body: patch,
  });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ ok: true; otherSessionsRevoked: number }>("/auth/change-password", {
    method: "POST",
    body: { current_password: currentPassword, new_password: newPassword },
  });
}

export function listSessions(): Promise<SessionDto[]> {
  return apiFetch<{ sessions: SessionDto[] }>("/auth/sessions").then((r) => r.sessions);
}

export function revokeSession(id: string) {
  return apiFetch<{ ok: true }>(`/auth/sessions/${id}/revoke`, { method: "POST" });
}

export function revokeOtherSessions() {
  return apiFetch<{ ok: true; revoked: number }>("/auth/sessions/revoke-others", { method: "POST" });
}
