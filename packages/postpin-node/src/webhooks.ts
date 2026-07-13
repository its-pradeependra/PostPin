import { createHmac, timingSafeEqual } from "node:crypto";
import { SignatureVerificationError } from "./errors.js";
import type { WebhookEvent } from "./types.js";

/**
 * Verify inbound Postpin webhooks. Postpin signs each delivery with:
 *
 *   x-postpin-signature: t=<unix-seconds>,v1=<hex hmac-sha256("<t>.<rawBody>", secret)>
 *
 * ALWAYS verify against the RAW request body bytes (not a re-serialized object)
 * — re-serialization changes whitespace/key-order and breaks the signature.
 */

export interface VerifyOptions {
  /** Reject signatures whose timestamp is older/newer than this many seconds. Default: 300 (5 min). 0 disables. */
  toleranceSeconds?: number;
  /** Override "now" (seconds) — for testing. */
  nowSeconds?: number;
}

const DEFAULT_TOLERANCE = 300;

function toBuffer(payload: string | Buffer): Buffer {
  return typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
}

function headerValue(header: string | string[] | undefined | null): string {
  if (Array.isArray(header)) return header[0] ?? "";
  return header ?? "";
}

function parseSignature(header: string): { t: number; v1: string } {
  let t = NaN;
  let v1 = "";
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === "t") t = Number(val);
    else if (key === "v1") v1 = val;
  }
  return { t, v1 };
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let ab: Buffer;
  let bb: Buffer;
  try {
    ab = Buffer.from(a, "hex");
    bb = Buffer.from(b, "hex");
  } catch {
    return false;
  }
  if (ab.length !== bb.length || ab.length === 0) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verify a webhook signature. Returns `true` on success; throws
 * {@link SignatureVerificationError} on any failure (bad format, wrong
 * signature, or stale timestamp).
 */
export function verify(
  payload: string | Buffer,
  signatureHeader: string | string[] | undefined | null,
  secret: string,
  options: VerifyOptions = {},
): true {
  const header = headerValue(signatureHeader);
  if (!header) throw new SignatureVerificationError("Missing Postpin signature header.", { code: "signature_missing" });
  if (!secret) throw new SignatureVerificationError("A webhook signing secret is required.", { code: "secret_missing" });

  const { t, v1 } = parseSignature(header);
  if (!Number.isFinite(t) || !v1) {
    throw new SignatureVerificationError("Malformed Postpin signature header.", { code: "signature_malformed" });
  }

  const raw = toBuffer(payload);
  const expected = createHmac("sha256", secret).update(`${t}.`).update(raw).digest("hex");

  if (!constantTimeEqualHex(v1, expected)) {
    throw new SignatureVerificationError("Webhook signature does not match — payload may be forged or the secret is wrong.", {
      code: "signature_mismatch",
    });
  }

  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE;
  if (tolerance > 0) {
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - t) > tolerance) {
      throw new SignatureVerificationError(
        `Webhook timestamp is outside the allowed tolerance of ${tolerance}s (possible replay).`,
        { code: "signature_timestamp" },
      );
    }
  }
  return true;
}

/**
 * Verify the signature and return the parsed, typed event in one step —
 * the safe way to consume a webhook.
 */
export function constructEvent<T = unknown>(
  payload: string | Buffer,
  signatureHeader: string | string[] | undefined | null,
  secret: string,
  options: VerifyOptions = {},
): WebhookEvent<T> {
  verify(payload, signatureHeader, secret, options);
  try {
    return JSON.parse(toBuffer(payload).toString("utf8")) as WebhookEvent<T>;
  } catch (err) {
    throw new SignatureVerificationError("Webhook payload is not valid JSON.", { code: "invalid_json", cause: err });
  }
}
