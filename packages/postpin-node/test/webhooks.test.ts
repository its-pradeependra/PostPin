import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { Postpin, SignatureVerificationError } from "../src/index.js";

const secret = "whsec_test_secret";

function sign(payload: string, ts: number, withSecret = secret): string {
  const v1 = createHmac("sha256", withSecret).update(`${ts}.${payload}`).digest("hex");
  return `t=${ts},v1=${v1}`;
}

const NOW = 1_718_900_000;
const payload = JSON.stringify({ id: "evt_1", event: "rate.calculated", created: "2026-07-01T00:00:00Z", data: { total: 254.38 } });

describe("webhooks.verify", () => {
  it("accepts a valid signature", () => {
    const header = sign(payload, NOW);
    expect(Postpin.webhooks.verify(payload, header, secret, { nowSeconds: NOW })).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const header = sign(payload, NOW);
    expect(() => Postpin.webhooks.verify(payload + " ", header, secret, { nowSeconds: NOW })).toThrow(SignatureVerificationError);
  });

  it("rejects the wrong secret", () => {
    const header = sign(payload, NOW, "whsec_wrong");
    const caught = (() => {
      try {
        Postpin.webhooks.verify(payload, header, secret, { nowSeconds: NOW });
      } catch (e) {
        return e;
      }
    })();
    expect(caught).toBeInstanceOf(SignatureVerificationError);
    expect((caught as SignatureVerificationError).code).toBe("signature_mismatch");
  });

  it("rejects a stale timestamp (replay)", () => {
    const header = sign(payload, NOW - 10_000);
    expect(() => Postpin.webhooks.verify(payload, header, secret, { nowSeconds: NOW, toleranceSeconds: 300 })).toThrow(/tolerance/i);
  });

  it("allows a stale timestamp when tolerance is disabled", () => {
    const header = sign(payload, NOW - 10_000);
    expect(Postpin.webhooks.verify(payload, header, secret, { nowSeconds: NOW, toleranceSeconds: 0 })).toBe(true);
  });

  it("rejects a missing or malformed header", () => {
    expect(() => Postpin.webhooks.verify(payload, "", secret)).toThrow(/missing/i);
    expect(() => Postpin.webhooks.verify(payload, "garbage", secret)).toThrow(/malformed/i);
  });

  it("accepts a Buffer payload", () => {
    const header = sign(payload, NOW);
    expect(Postpin.webhooks.verify(Buffer.from(payload), header, secret, { nowSeconds: NOW })).toBe(true);
  });

  it("handles an array header (Node raw headers)", () => {
    const header = sign(payload, NOW);
    expect(Postpin.webhooks.verify(payload, [header, "extra"], secret, { nowSeconds: NOW })).toBe(true);
  });
});

describe("webhooks.constructEvent", () => {
  it("verifies and returns the typed event", () => {
    const header = sign(payload, NOW);
    const event = Postpin.webhooks.constructEvent<{ total: number }>(payload, header, secret, { nowSeconds: NOW });
    expect(event.id).toBe("evt_1");
    expect(event.event).toBe("rate.calculated");
    expect(event.data.total).toBe(254.38);
  });

  it("throws before parsing if the signature is invalid", () => {
    expect(() => Postpin.webhooks.constructEvent(payload, sign(payload, NOW, "nope"), secret, { nowSeconds: NOW })).toThrow(SignatureVerificationError);
  });
});
