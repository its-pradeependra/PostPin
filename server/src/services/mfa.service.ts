import crypto from "node:crypto";
import { authenticator } from "otplib";
import qrcode from "qrcode";
import { env } from "@/config/env.js";
import { AppError } from "@/lib/errors.js";
import { sha256 } from "@/lib/crypto.js";
import { UserModel } from "@/models/index.js";
import { writeAudit } from "@/services/audit.service.js";
import type { Types } from "mongoose";

/** TOTP two-factor auth for platform staff. The shared secret is stored
 * AES-256-GCM encrypted (never in plaintext); backup codes are one-time and
 * stored only as SHA-256 hashes. */

const KEY = crypto.createHash("sha256").update(env.API_KEY_PEPPER).digest(); // 32 bytes

function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

function decryptSecret(blob: string): string {
  const [ivB64, tagB64, dataB64] = blob.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64!, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64!, "base64")), decipher.final()]).toString("utf8");
}

interface MfaLike {
  enabled?: boolean;
  secretEnc?: string | null;
  backupCodesHashed?: string[];
  lastTotpStep?: number | null;
}

/** Start enrollment: generate a fresh secret, stash it (still disabled), and
 * return the otpauth URI + a QR data-URL for the authenticator app. */
export async function beginTotpSetup(userId: Types.ObjectId | string) {
  const user = await UserModel.findById(userId);
  if (!user) throw AppError.notFound("User not found");

  const secret = authenticator.generateSecret();
  user.set("mfa.secretEnc", encryptSecret(secret));
  user.set("mfa.enabled", false);
  await user.save();

  const otpauth = authenticator.keyuri(user.email, "Postpin", secret);
  const qrDataUrl = await qrcode.toDataURL(otpauth);
  return { otpauth, qr_data_url: qrDataUrl };
}

function genBackupCodes(n = 8): string[] {
  return Array.from({ length: n }, () => crypto.randomBytes(5).toString("hex")); // 10-char hex
}

/** Confirm the first code from the app → turn 2FA on and mint one-time backup codes. */
export async function enableTotp(userId: Types.ObjectId | string, code: string) {
  const user = await UserModel.findById(userId);
  if (!user) throw AppError.notFound("User not found");
  const mfa = (user.mfa ?? {}) as MfaLike;
  if (!mfa.secretEnc) throw AppError.badRequest("Start setup first", "mfa_not_started");
  if (mfa.enabled) throw AppError.badRequest("2FA is already enabled", "mfa_already_enabled");

  const secret = decryptSecret(mfa.secretEnc);
  if (!authenticator.check(code.trim(), secret)) {
    throw AppError.badRequest("That code is incorrect — check your authenticator app", "invalid_totp");
  }
  const backupCodes = genBackupCodes();
  user.set("mfa.enabled", true);
  user.set("mfa.backupCodesHashed", backupCodes.map((c) => sha256(c)));
  await user.save();

  await writeAudit({
    action: "account.2fa_enabled",
    category: "security",
    severity: "warning",
    actorId: user._id,
    actorEmail: user.email,
    resource: { kind: "user", id: String(user._id), name: user.email },
  });
  return { enabled: true, backup_codes: backupCodes };
}

/** Verify a TOTP (or a one-time backup code) for a user. Consumes backup codes
 * and rejects TOTP replay within the same 30s step. */
export async function verifyTotpForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any,
  code: string,
): Promise<boolean> {
  const mfa = (user.mfa ?? {}) as MfaLike;
  if (!mfa.enabled || !mfa.secretEnc) return false;
  const clean = code.trim().replace(/\s+/g, "");

  // Backup code path.
  const hashed = sha256(clean);
  const idx = (mfa.backupCodesHashed ?? []).indexOf(hashed);
  if (idx >= 0) {
    const remaining = [...(mfa.backupCodesHashed ?? [])];
    remaining.splice(idx, 1);
    user.set("mfa.backupCodesHashed", remaining);
    await user.save();
    return true;
  }

  // TOTP path with replay guard.
  const secret = decryptSecret(mfa.secretEnc);
  if (!authenticator.check(clean, secret)) return false;
  const step = Math.floor(Date.now() / 1000 / (authenticator.options.step ?? 30));
  if (mfa.lastTotpStep === step) return false; // already used this window
  user.set("mfa.lastTotpStep", step);
  await user.save();
  return true;
}

/** Disable 2FA after re-verifying a current code. */
export async function disableTotp(userId: Types.ObjectId | string, code: string) {
  const user = await UserModel.findById(userId);
  if (!user) throw AppError.notFound("User not found");
  const mfa = (user.mfa ?? {}) as MfaLike;
  if (!mfa.enabled) throw AppError.badRequest("2FA is not enabled", "mfa_not_enabled");
  const ok = await verifyTotpForUser(user, code);
  if (!ok) throw AppError.badRequest("That code is incorrect", "invalid_totp");

  user.set("mfa.enabled", false);
  user.set("mfa.secretEnc", null);
  user.set("mfa.backupCodesHashed", []);
  user.set("mfa.lastTotpStep", null);
  await user.save();
  await writeAudit({
    action: "account.2fa_disabled",
    category: "security",
    severity: "warning",
    actorId: user._id,
    actorEmail: user.email,
    resource: { kind: "user", id: String(user._id), name: user.email },
  });
  return { enabled: false };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mfaStatus(user: any) {
  const mfa = (user?.mfa ?? {}) as MfaLike;
  return { enabled: Boolean(mfa.enabled), backup_codes_remaining: (mfa.backupCodesHashed ?? []).length };
}
