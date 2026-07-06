import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { ApiKeyModel, ApiLogModel } from "@/models/index.js";
import { reconcileKeyUsage } from "@/scripts/backfill-key-usage.js";
import { clearCollections, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";

const companyId = new Types.ObjectId();

async function makeKey(name: string, requestCount: number) {
  return ApiKeyModel.create({
    companyId,
    name,
    mode: "test",
    prefix: `pp_test_${name}`,
    last4: "abcd",
    hashedKey: `hash_${name}_${Math.round(requestCount)}`,
    lookupId: `pp_test_${name}`,
    status: "active",
    requestCount,
    createdByUserId: new Types.ObjectId(),
  });
}

async function logCall(apiKeyId: Types.ObjectId, at: Date) {
  return ApiLogModel.create({
    companyId,
    apiKeyId,
    keyPrefix: "pp_test",
    method: "POST",
    endpoint: "/v1/rates/calculate",
    statusCode: 200,
    outcome: "success",
    latencyMs: 5,
    billable: true,
    createdAt: at,
  });
}

beforeAll(startMemoryDb);
afterAll(stopMemoryDb);
beforeEach(clearCollections);

describe("backfill: reconcile key requestCount from apiLogs", () => {
  it("restores under-counted keys, sets lastUsedAt, and leaves correct keys alone", async () => {
    // Key A: bug undercounted it — 3 logged calls but requestCount stuck at 1.
    const a = await makeKey("undercounted", 1);
    const t1 = new Date("2026-07-01T10:00:00Z");
    const t2 = new Date("2026-07-04T12:00:00Z");
    await logCall(a._id, t1);
    await logCall(a._id, t2);
    await logCall(a._id, new Date("2026-07-02T09:00:00Z"));

    // Key B: already correct (2 logs, counter 2) → must be left untouched.
    const b = await makeKey("correct", 2);
    await logCall(b._id, t1);
    await logCall(b._id, t2);

    // Key C: never used (no logs, counter 0) → untouched.
    await makeKey("unused", 0);

    const summary = await reconcileKeyUsage();
    expect(summary).toMatchObject({ keys: 3, updated: 1, unchanged: 2 });

    const fresh = await ApiKeyModel.findById(a._id).lean();
    expect(fresh!.requestCount).toBe(3); // 1 → 3
    expect(new Date(fresh!.lastUsedAt!).getTime()).toBe(t2.getTime()); // newest log

    const bFresh = await ApiKeyModel.findById(b._id).lean();
    expect(bFresh!.requestCount).toBe(2); // unchanged
  });

  it("is idempotent — a second run changes nothing", async () => {
    const a = await makeKey("k", 0);
    await logCall(a._id, new Date("2026-07-03T10:00:00Z"));
    await logCall(a._id, new Date("2026-07-03T11:00:00Z"));

    const first = await reconcileKeyUsage();
    expect(first.updated).toBe(1);
    expect((await ApiKeyModel.findById(a._id).lean())!.requestCount).toBe(2);

    const second = await reconcileKeyUsage();
    expect(second.updated).toBe(0);
    expect(second.unchanged).toBe(1);
    expect((await ApiKeyModel.findById(a._id).lean())!.requestCount).toBe(2);
  });
});
