import { apiFetch, setAccessToken } from "@/lib/api/client";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  companyId: string | null;
  isPlatformStaff: boolean;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await apiFetch<{ access_token: string; user: AuthUser }>("/auth/login", {
    method: "POST",
    body: { email, password },
    noRetry: true,
  });
  setAccessToken(res.access_token);
  return res.user;
}

export function signup(input: {
  email: string;
  password: string;
  name: string;
  company_name: string;
  marketing_consent?: boolean;
}) {
  return apiFetch<{ company_id: string; user_id: string; email_verification_required: boolean }>(
    "/auth/signup",
    { method: "POST", body: input, noRetry: true },
  );
}

export function verifyEmail(token: string) {
  return apiFetch<{ verified: boolean }>("/auth/verify-email", { method: "POST", body: { token }, noRetry: true });
}

export function resendVerification(email: string) {
  return apiFetch<{ sent: boolean }>("/auth/verify-email/resend", { method: "POST", body: { email }, noRetry: true });
}

export function forgotPassword(email: string) {
  return apiFetch<{ ok: boolean }>("/auth/forgot-password", { method: "POST", body: { email }, noRetry: true });
}

export function resetPassword(token: string, newPassword: string) {
  return apiFetch<{ ok: boolean }>("/auth/reset-password", {
    method: "POST",
    body: { token, new_password: newPassword },
    noRetry: true,
  });
}

export async function logout(): Promise<void> {
  try {
    await apiFetch("/auth/logout", { method: "POST", noRetry: true });
  } catch {
    /* ignore — clear locally regardless */
  }
  setAccessToken(null);
}
