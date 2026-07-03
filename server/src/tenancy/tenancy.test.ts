import { Schema, Types, model } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runWithContext } from "@/context/request-context.js";
import { assertScoped, AuditLogModel } from "@/models/index.js";
import { scopedRepo } from "@/tenancy/scoped-repo.js";
import { clearCollections, makeContext, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";

// A throwaway scoped model for exercising the repository.
const thingSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, required: true },
  name: { type: String },
  createdByUserId: { type: Schema.Types.ObjectId },
});
thingSchema.index({ companyId: 1, name: 1 });
const Thing = model("TestThing", thingSchema);

const A = new Types.ObjectId();
const B = new Types.ObjectId();

beforeAll(startMemoryDb);
afterAll(stopMemoryDb);
beforeEach(clearCollections);

describe("assertScoped (index invariant)", () => {
  it("passes — every scoped model has a companyId-leading index", () => {
    expect(() => assertScoped()).not.toThrow();
  });
});

describe("scopedRepo (tenant isolation)", () => {
  it("injects companyId on create, overriding a client-supplied companyId", async () => {
    const doc = await runWithContext(makeContext({ companyId: A }), () =>
      scopedRepo(Thing).create({ companyId: B, name: "x" }),
    );
    expect(String(doc.companyId)).toBe(String(A)); // injection wins
    expect(String(doc.companyId)).not.toBe(String(B));
  });

  it("records a tamper audit when a client supplies companyId", async () => {
    await runWithContext(makeContext({ companyId: A }), () =>
      scopedRepo(Thing).create({ companyId: B, name: "y" }),
    );
    // audit write is fire-and-forget; give the event loop a tick
    await new Promise((r) => setImmediate(r));
    const tamper = await AuditLogModel.findOne({ action: "tenant.body_injection" });
    expect(tamper).not.toBeNull();
  });

  it("findById returns null for another tenant's document (404-before-403)", async () => {
    const bDoc = await Thing.create({ companyId: B, name: "b" });
    const found = await runWithContext(makeContext({ companyId: A }), () =>
      scopedRepo(Thing).findById(bDoc._id),
    );
    expect(found).toBeNull();
  });

  it("find() returns only the caller's tenant rows", async () => {
    await Thing.create({ companyId: A, name: "a" });
    await Thing.create({ companyId: B, name: "b" });
    const rows = await runWithContext(makeContext({ companyId: A }), () => scopedRepo(Thing).find());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("a");
  });

  it("aggregate() is constrained to the caller's tenant", async () => {
    await Thing.create({ companyId: A, name: "a" });
    await Thing.create({ companyId: B, name: "b" });
    const rows = await runWithContext(makeContext({ companyId: A }), () =>
      scopedRepo(Thing).aggregate([{ $project: { name: 1 } }]),
    );
    expect(rows).toHaveLength(1);
  });

  it("throws when companyId is null (platform actor must use the admin repo)", () => {
    expect(() => runWithContext(makeContext({ companyId: null }), () => scopedRepo(Thing))).toThrow(
      /tenant context/i,
    );
  });
});
