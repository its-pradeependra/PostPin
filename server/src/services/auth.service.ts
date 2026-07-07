import { type Types } from "mongoose";
import { AUTH } from "@/config/constants.js";
import { env } from "@/config/env.js";
import { hashPassword, randomToken, sha256, verifyPassword } from "@/lib/crypto.js";
import { AppError } from "@/lib/errors.js";
import { signAccessToken } from "@/lib/jwt.js";
import { CompanyModel, SubscriptionModel, UserModel } from "@/models/index.js";
import { writeAudit } from "@/services/audit.service.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { sendResetEmail, sendVerifyEmail } from "@/services/email.service.js";
import { resolveRolePerms } from "@/services/rbac.service.js";
import {
  createSession,
  revokeAllSessions,
  revokeOtherSessions,
  revokeSessionByToken,
  rotateSession,
} from "@/services/session.service.js";

function invalidCreds(): never {
  throw AppError.unauthorized("Invalid email or password");
}

// ── Signup / verify ──────────────────────────────────────────────────────────

export async function signup(input: { email: string; password: string; name: string; companyName: string; marketingConsent?: boolean }) {
  if (input.password.length < AUTH.minPasswordLength) {
    throw AppError.badRequest(`Password must be at least ${AUTH.minPasswordLength} characters`, "weak_password");
  }
  const res = await onboardCompany({
    companyName: input.companyName,
    ownerName: input.name,
    ownerEmail: input.email,
    password: input.password,
    emailVerified: false,
    marketingConsent: input.marketingConsent,
  });
  if (res.rawVerifyToken) await sendVerifyEmail(input.email, res.rawVerifyToken);
  await writeAudit({
    action: "company.signup",
    category: "auth",
    actorType: "user",
    actorId: res.ownerUserId,
    actorEmail: input.email.toLowerCase(),
    companyId: res.companyId,
  });
  return {
    company_id: String(res.companyId),
    user_id: String(res.ownerUserId),
    email_verification_required: true,
  };
}

export async function verifyEmail(token: string) {
  const user = await UserModel.findOne({
    emailVerifyTokenHash: sha256(token),
    emailVerifyExpiresAt: { $gt: new Date() },
  });
  if (!user) throw AppError.badRequest("This verification link is invalid or has expired", "invalid_token");

  user.emailVerifiedAt = new Date();
  user.status = "active";
  user.emailVerifyTokenHash = null;
  user.emailVerifyExpiresAt = null;
  await user.save();

  if (user.companyId) {
    await CompanyModel.updateOne(
      { _id: user.companyId },
      { $set: { status: "active", onboardingStep: "verified" } },
    );
  }
  await writeAudit({
    action: "auth.email_verified",
    category: "auth",
    actorId: user._id,
    actorEmail: user.email,
    companyId: user.companyId,
  });
  return { verified: true };
}

export async function resendVerification(email: string) {
  const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
  if (!user || user.emailVerifiedAt) return { sent: true }; // no enumeration
  const token = randomToken(32);
  user.emailVerifyTokenHash = sha256(token);
  user.emailVerifyExpiresAt = new Date(Date.now() + AUTH.emailVerifyTtlMs);
  await user.save();
  await sendVerifyEmail(user.email, token);
  return { sent: true };
}

// ── Login ──────────────────────────────────────────────────────────────────

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  csrfToken: string;
  refreshExpiresAt: Date;
  persistent: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    permissions: string[];
    companyId: string | null;
    isPlatformStaff: boolean;
  };
}

export async function login(input: {
  email: string;
  password: string;
  ip: string;
  userAgent: string;
  remember?: boolean;
}): Promise<LoginResult | MfaChallenge> {
  const email = input.email.toLowerCase().trim();
  const user = await UserModel.findOne({ email });
  if (!user) invalidCreds();

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new AppError("account_locked", "Account temporarily locked. Try again later.", 423);
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    user.failedLoginCount += 1;
    if (user.failedLoginCount >= AUTH.maxFailedLogins) {
      user.lockedUntil = new Date(Date.now() + AUTH.lockoutMs);
      user.failedLoginCount = 0;
      // Ops alert: repeated bad passwords locked an account (possible attack).
      void import("@/services/platform-alerts.service.js")
        .then(({ dispatchPlatformAlert }) =>
          dispatchPlatformAlert({
            severity: "warning",
            event: "security.alert",
            title: "Account locked after repeated failed logins",
            body: `${email} was locked for ${Math.round(AUTH.lockoutMs / 60000)} minutes after ${AUTH.maxFailedLogins} failed attempts (ip ${input.ip}).`,
          }),
        )
        .catch(() => {});
    }
    await user.save();
    await writeAudit({
      action: "auth.login_failed",
      category: "auth",
      outcome: "failure",
      actorId: user._id,
      actorEmail: email,
      companyId: user.companyId,
    });
    invalidCreds();
  }

  if (!user.emailVerifiedAt) {
    throw new AppError("email_unverified", "Please verify your email before logging in", 403);
  }
  // Only fully-active accounts may mint a session — invited members must accept
  // their invite first, and suspended/disabled accounts can't log in at all.
  if (user.status !== "active") {
    throw new AppError("account_inactive", "This account isn't active yet — accept your invitation or contact an admin", 403);
  }
  // A platform-suspended WORKSPACE blocks every one of its users at the door.
  // (Suspension also revokes sessions + bumps permVersion, so this check only
  // needs to live at token issuance, not on the per-request hot path.)
  if (user.companyId) {
    const company = await CompanyModel.findById(user.companyId).select("status").lean();
    if (company?.status === "suspended") {
      throw new AppError("workspace_suspended", "This workspace has been suspended — contact support", 403);
    }
  }

  // Two-factor gate: if the account has TOTP enabled, don't mint a session yet —
  // return a short-lived challenge the client redeems with a code.
  if ((user.mfa as { enabled?: boolean } | undefined)?.enabled) {
    const { signPurposeToken } = await import("@/lib/jwt.js");
    // Carry the remember-me choice through the 2FA step so it survives to session mint.
    const mfaToken = await signPurposeToken("mfa_login", { sub: String(user._id), remember: input.remember !== false }, 300);
    return { mfaRequired: true as const, mfaToken };
  }

  return issueLoginResult(user, input.ip, input.userAgent, ["pwd"], input.remember);
}

/** Mint the session + access token for an authenticated user. Shared by the
 * password path and the 2FA-completion path. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function issueLoginResult(user: any, ip: string, userAgent: string, amr: string[], remember?: boolean): Promise<LoginResult> {
  user.failedLoginCount = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  user.lastLoginIp = ip;
  await user.save();

  const { roleKey, permissions } = await resolveRolePerms(user.roleId);
  const session = await createSession({
    userId: user._id,
    companyId: user.companyId ?? null,
    ip,
    userAgent,
    amr,
    persistent: remember !== false,
  });
  const accessToken = await signAccessToken({
    sub: String(user._id),
    companyId: user.companyId ? String(user.companyId) : null,
    role: roleKey,
    permVersion: user.permVersion,
    isPlatformStaff: user.isPlatformStaff,
    sid: session.sessionId,
    amr,
  });

  await writeAudit({
    action: "auth.login",
    category: "auth",
    actorType: user.isPlatformStaff ? "admin" : "user",
    actorId: user._id,
    actorEmail: user.email,
    companyId: user.companyId,
    metadata: { amr },
  });

  return {
    accessToken,
    expiresIn: env.ACCESS_TOKEN_TTL,
    refreshToken: session.rawRefreshToken,
    csrfToken: randomToken(24),
    refreshExpiresAt: session.expiresAt,
    persistent: session.persistent,
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: roleKey,
      permissions,
      companyId: user.companyId ? String(user.companyId) : null,
      isPlatformStaff: user.isPlatformStaff,
    },
  };
}

export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}

/** Second factor: redeem the MFA challenge with a TOTP or backup code. */
export async function completeMfaLogin(input: { mfaToken: string; code: string; ip: string; userAgent: string }): Promise<LoginResult> {
  const { verifyPurposeToken } = await import("@/lib/jwt.js");
  let sub: string;
  let remember = true;
  try {
    const payload = await verifyPurposeToken(input.mfaToken, "mfa_login");
    sub = String(payload.sub);
    remember = (payload as { remember?: boolean }).remember !== false;
  } catch {
    throw new AppError("mfa_challenge_invalid", "This 2FA session expired — sign in again", 401);
  }
  const user = await UserModel.findById(sub);
  if (!user || user.status !== "active") throw new AppError("mfa_challenge_invalid", "This 2FA session expired — sign in again", 401);

  const { verifyTotpForUser } = await import("@/services/mfa.service.js");
  const ok = await verifyTotpForUser(user, input.code);
  if (!ok) {
    await writeAudit({ action: "auth.2fa_failed", category: "security", outcome: "failure", actorId: user._id, actorEmail: user.email });
    throw new AppError("invalid_totp", "That code is incorrect", 401);
  }
  return issueLoginResult(user, input.ip, input.userAgent, ["pwd", "otp"], remember);
}

/** Re-verify the current user (password + 2FA if enabled) and mint a short-lived
 * step-up token for a sensitive action (e.g. impersonation). */
export async function stepUp(input: { userId: Types.ObjectId; password: string; code?: string }): Promise<{ stepUpToken: string; expiresIn: number }> {
  const user = await UserModel.findById(input.userId);
  if (!user) throw AppError.unauthorized();
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) throw new AppError("invalid_password", "Password is incorrect", 401);
  if ((user.mfa as { enabled?: boolean } | undefined)?.enabled) {
    const { verifyTotpForUser } = await import("@/services/mfa.service.js");
    const passed = input.code ? await verifyTotpForUser(user, input.code) : false;
    if (!passed) throw new AppError("invalid_totp", "Enter your current 2FA code", 401);
  }
  const { signPurposeToken } = await import("@/lib/jwt.js");
  const stepUpToken = await signPurposeToken("step_up", { sub: String(user._id) }, 600);
  await writeAudit({ action: "auth.step_up", category: "security", severity: "notice", actorId: user._id, actorEmail: user.email });
  return { stepUpToken, expiresIn: 600 };
}

// ── Refresh / logout ─────────────────────────────────────────────────────────

export async function refresh(input: { rawToken: string; ip: string; userAgent: string }) {
  const result = await rotateSession(input.rawToken, { ip: input.ip, userAgent: input.userAgent });
  if (!result.ok) {
    if (result.reason === "reuse") {
      await writeAudit({
        action: "auth.refresh_reuse",
        category: "security",
        severity: "critical",
        outcome: "denied",
      });
    }
    throw AppError.unauthorized("Session expired — please log in again", "refresh_invalid");
  }

  const user = await UserModel.findById(result.userId);
  if (!user || user.status !== "active") throw AppError.unauthorized("Session no longer valid");

  const { roleKey } = await resolveRolePerms(user.roleId);
  const accessToken = await signAccessToken({
    sub: String(user._id),
    companyId: user.companyId ? String(user.companyId) : null,
    role: roleKey,
    permVersion: user.permVersion,
    isPlatformStaff: user.isPlatformStaff,
    sid: result.sessionId,
    amr: ["pwd"],
  });

  return {
    accessToken,
    expiresIn: env.ACCESS_TOKEN_TTL,
    refreshToken: result.rawRefreshToken,
    csrfToken: randomToken(24),
    refreshExpiresAt: result.expiresAt,
    persistent: result.persistent,
  };
}

export async function logout(rawToken: string | undefined) {
  if (rawToken) await revokeSessionByToken(rawToken);
  return { ok: true };
}

export async function logoutEverywhere(userId: Types.ObjectId) {
  await revokeAllSessions(userId);
  await UserModel.updateOne({ _id: userId }, { $inc: { permVersion: 1 } });
  await writeAudit({ action: "auth.logout_all", category: "security", actorId: userId });
  return { ok: true };
}

// ── Password reset ───────────────────────────────────────────────────────────

export async function forgotPassword(email: string) {
  const user = await UserModel.findOne({ email: email.toLowerCase().trim() });
  if (user) {
    const token = randomToken(32);
    user.passwordResetTokenHash = sha256(token);
    user.passwordResetExpiresAt = new Date(Date.now() + AUTH.passwordResetTtlMs);
    await user.save();
    await sendResetEmail(user.email, token);
  }
  // Always succeed — never reveal whether the email exists.
  return { ok: true };
}

export async function resetPassword(input: { token: string; newPassword: string }) {
  if (input.newPassword.length < AUTH.minPasswordLength) {
    throw AppError.badRequest(`Password must be at least ${AUTH.minPasswordLength} characters`, "weak_password");
  }
  const user = await UserModel.findOne({
    passwordResetTokenHash: sha256(input.token),
    passwordResetExpiresAt: { $gt: new Date() },
  });
  if (!user) throw AppError.badRequest("This reset link is invalid or has expired", "invalid_token");

  user.passwordHash = await hashPassword(input.newPassword);
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  user.passwordUpdatedAt = new Date();
  user.permVersion += 1; // invalidate outstanding access tokens
  await user.save();
  await revokeAllSessions(user._id); // log out everywhere on reset
  await writeAudit({
    action: "auth.password_reset",
    category: "security",
    severity: "warning",
    actorId: user._id,
    actorEmail: user.email,
    companyId: user.companyId,
  });
  return { ok: true };
}

// ── Invite acceptance ────────────────────────────────────────────────────────

export async function acceptInvite(input: { token: string; name: string; password: string }) {
  if (input.password.length < AUTH.minPasswordLength) {
    throw AppError.badRequest(`Password must be at least ${AUTH.minPasswordLength} characters`, "weak_password");
  }
  const user = await UserModel.findOne({
    passwordResetTokenHash: sha256(input.token),
    passwordResetExpiresAt: { $gt: new Date() },
    status: "invited",
  });
  if (!user) throw AppError.badRequest("This invitation is invalid or has expired", "invalid_token");
  user.name = input.name.trim();
  user.passwordHash = await hashPassword(input.password);
  user.status = "active";
  user.emailVerifiedAt = user.emailVerifiedAt ?? new Date();
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  user.passwordUpdatedAt = new Date();
  await user.save();
  await writeAudit({
    action: "member.invite_accepted",
    category: "security",
    actorId: user._id,
    actorEmail: user.email,
    companyId: user.companyId,
  });
  return { ok: true, email: user.email };
}

// ── Account (profile + password) ─────────────────────────────────────────────

export async function updateProfile(
  userId: Types.ObjectId,
  patch: { name?: string; locale?: string; timezone?: string; marketingConsent?: boolean },
) {
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.locale !== undefined) set.locale = patch.locale;
  if (patch.timezone !== undefined) set.timezone = patch.timezone;
  if (patch.marketingConsent !== undefined) {
    set.marketingConsent = patch.marketingConsent;
    set.marketingConsentAt = patch.marketingConsent ? new Date() : null;
  }
  const user = await UserModel.findByIdAndUpdate(userId, { $set: set }, { new: true }).lean();
  if (!user) throw AppError.notFound("User not found");
  await writeAudit({
    action: "account.profile_updated",
    category: "security",
    actorId: userId,
    actorEmail: user.email,
    companyId: user.companyId,
  });
  return {
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      locale: user.locale,
      timezone: user.timezone,
      marketing_consent: user.marketingConsent ?? false,
    },
  };
}

export async function changePassword(
  userId: Types.ObjectId,
  keepSessionId: string,
  input: { currentPassword: string; newPassword: string },
) {
  const user = await UserModel.findById(userId);
  if (!user) throw AppError.notFound("User not found");
  const ok = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!ok) throw AppError.badRequest("Your current password is incorrect", "invalid_password");
  if (input.newPassword.length < AUTH.minPasswordLength) {
    throw AppError.badRequest(`Password must be at least ${AUTH.minPasswordLength} characters`, "weak_password");
  }
  if (await verifyPassword(user.passwordHash, input.newPassword)) {
    throw AppError.badRequest("Choose a password different from your current one", "weak_password");
  }
  user.passwordHash = await hashPassword(input.newPassword);
  user.passwordUpdatedAt = new Date();
  user.permVersion += 1; // invalidate outstanding access tokens across devices
  await user.save();
  // Keep the current session; sign every OTHER device out.
  const otherSessionsRevoked = await revokeOtherSessions(user._id, keepSessionId);
  await writeAudit({
    action: "auth.password_changed",
    category: "security",
    severity: "warning",
    actorId: userId,
    actorEmail: user.email,
    companyId: user.companyId,
  });
  return { ok: true, otherSessionsRevoked };
}

// ── Me ───────────────────────────────────────────────────────────────────────

export async function getMe(userId: Types.ObjectId) {
  const user = await UserModel.findById(userId).lean();
  if (!user) throw AppError.notFound("User not found");
  const { roleKey, permissions } = await resolveRolePerms(user.roleId);

  let company: Record<string, unknown> | null = null;
  let subscription: Record<string, unknown> | null = null;
  if (user.companyId) {
    const c = await CompanyModel.findById(user.companyId).lean();
    if (c) {
      company = { id: String(c._id), name: c.name, slug: c.slug, status: c.status, onboardingStep: c.onboardingStep };
    }
    const sub = await SubscriptionModel.findOne({ companyId: user.companyId, status: "active" }).lean();
    if (sub) {
      subscription = {
        plan_code: sub.planCode,
        status: sub.status,
        interval: sub.interval,
        current_period_end: sub.currentPeriodEnd,
        usage: sub.usage,
      };
    }
  }

  return {
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: roleKey,
      permissions,
      is_platform_staff: user.isPlatformStaff,
      avatar_url: user.avatarUrl ?? null,
      locale: user.locale,
      timezone: user.timezone,
      marketing_consent: user.marketingConsent ?? false,
    },
    company,
    subscription,
  };
}
