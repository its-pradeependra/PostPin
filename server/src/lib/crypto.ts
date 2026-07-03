import { Algorithm, hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/config/env.js";

const argonOptions = {
  algorithm: Algorithm.Argon2id,
  memoryCost: env.ARGON_MEMORY_KIB,
  timeCost: env.ARGON_TIME_COST,
  parallelism: env.ARGON_PARALLELISM,
};

/** Hash a low-entropy secret (password) with Argon2id. */
export function hashPassword(password: string): Promise<string> {
  return argonHash(password, argonOptions);
}

/** Verify a password against an Argon2id PHC string. Never throws. */
export async function verifyPassword(phc: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(phc, password);
  } catch {
    return false;
  }
}

/** Cryptographically-random URL-safe token (default 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 hex digest — for high-entropy tokens (refresh/verify/reset) that need fast lookup. */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** HMAC-SHA256 hex digest — for API-key fingerprints (with a server pepper). */
export function hmacSha256(input: string, secret: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

/** Constant-time string comparison. */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
