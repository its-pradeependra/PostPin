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

/* ── Two-factor (TOTP) ────────────────────────────────────────────── */

export function get2faStatus() {
  return apiFetch<{ enabled: boolean; backup_codes_remaining: number }>("/auth/2fa/status");
}

export function setup2fa() {
  return apiFetch<{ otpauth: string; qr_data_url: string }>("/auth/2fa/setup", { method: "POST" });
}

export function enable2fa(code: string) {
  return apiFetch<{ enabled: boolean; backup_codes: string[] }>("/auth/2fa/enable", { method: "POST", body: { code } });
}

export function disable2fa(code: string) {
  return apiFetch<{ enabled: boolean }>("/auth/2fa/disable", { method: "POST", body: { code } });
}

/* ── Avatar (local-disk media) ────────────────────────────────────── */

export function uploadAvatar(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch<{ avatar_url: string }>("/auth/avatar", { method: "POST", body: fd });
}

export function removeAvatar() {
  return apiFetch<{ avatar_url: null }>("/auth/avatar", { method: "DELETE" });
}

/** Re-authenticate for a sensitive action; returns a short-lived step-up token. */
export function stepUp(password: string, code?: string) {
  return apiFetch<{ step_up_token: string; expires_in: number }>("/auth/step-up", {
    method: "POST",
    body: { password, ...(code ? { code } : {}) },
    noRetry: true,
  });
}
