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

export async function signup(input: { email: string; password: string; name: string; companyName: string }) {
  if (input.password.length < AUTH.minPasswordLength) {
    throw AppError.badRequest(`Password must be at least ${AUTH.minPasswordLength} characters`, "weak_password");
  }
  const res = await onboardCompany({
    companyName: input.companyName,
    ownerName: input.name,
    ownerEmail: input.email,
    password: input.password,
    emailVerified: false,
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
}): Promise<LoginResult> {
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

  user.failedLoginCount = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date();
  user.lastLoginIp = input.ip;
  await user.save();

  const { roleKey, permissions } = await resolveRolePerms(user.roleId);
  const session = await createSession({
    userId: user._id,
    companyId: user.companyId ?? null,
    ip: input.ip,
    userAgent: input.userAgent,
    amr: ["pwd"],
  });
  const accessToken = await signAccessToken({
    sub: String(user._id),
    companyId: user.companyId ? String(user.companyId) : null,
    role: roleKey,
    permVersion: user.permVersion,
    isPlatformStaff: user.isPlatformStaff,
    sid: session.sessionId,
    amr: ["pwd"],
  });

  await writeAudit({
    action: "auth.login",
    category: "auth",
    actorType: user.isPlatformStaff ? "admin" : "user",
    actorId: user._id,
    actorEmail: email,
    companyId: user.companyId,
  });

  return {
    accessToken,
    expiresIn: env.ACCESS_TOKEN_TTL,
    refreshToken: session.rawRefreshToken,
    csrfToken: randomToken(24),
    refreshExpiresAt: session.expiresAt,
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
  patch: { name?: string; locale?: string; timezone?: string },
) {
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.locale !== undefined) set.locale = patch.locale;
  if (patch.timezone !== undefined) set.timezone = patch.timezone;
  const user = await UserModel.findByIdAndUpdate(userId, { $set: set }, { new: true }).lean();
  if (!user) throw AppError.notFound("User not found");
  await writeAudit({
    action: "account.profile_updated",
    category: "security",
    actorId: userId,
    actorEmail: user.email,
    companyId: user.companyId,
  });
  return { user: { id: String(user._id), name: user.name, email: user.email, locale: user.locale, timezone: user.timezone } };
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
      locale: user.locale,
      timezone: user.timezone,
    },
    company,
    subscription,
  };
}
