import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { PermissionModel, PlanModel } from "@/models/index.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { clearCollections, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";

const PW = "Sup3rSecret!pw";
let app: AppInstance;

async function seed() {
  await PermissionModel.insertMany(
    PERMISSIONS.map((p) => ({
      key: p.key,
      resource: p.resource,
      action: p.action,
      group: p.group,
      scope: p.scope,
      description: p.description,
      isDangerous: "isDangerous" in p ? p.isDangerous : false,
    })),
  );
  await PlanModel.create({
    code: "free",
    version: 1,
    name: "Free",
    priceMonthlyPaise: 0,
    includedCalls: 1000,
    rateLimit: { rpm: 30, rpd: 0, burst: 10 },
    maxApiKeys: 10,
    maxTeamMembers: 2,
    isActive: true,
    isPublic: true,
  });
}

async function onboard(name: string, email: string) {
  await onboardCompany({ companyName: name, ownerName: "Owner", ownerEmail: email, password: PW, emailVerified: true });
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PW } });
  return (res.json() as { access_token: string }).access_token;
}

beforeAll(async () => {
  await startMemoryDb();
  await initJwt();
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await stopMemoryDb();
});
beforeEach(async () => {
  await clearCollections();
  await seed();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowFor = (card: any, zone: string) => card.rows.find((r: any) => r.zone === zone);

describe("M3 — rate-cards read surface (engine-consistent)", () => {
  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/rate-cards" });
    expect(res.statusCode).toBe(401);
  });

  it("returns a Standard card whose slabs match the rate engine, plus the zone map", async () => {
    const t = await onboard("Alpha Co", "a@alpha.test");
    const res = await app.inject({ method: "GET", url: "/v1/rate-cards", headers: { authorization: `Bearer ${t}` } });
    expect(res.statusCode).toBe(200);
    const { cards, zones } = res.json() as { cards: any[]; zones: any[] };

    const std = cards[0];
    expect(std.id).toBe("standard");
    expect(std.status).toBe("published");
    expect(std.editable).toBe(false);
    expect(std.rows).toHaveLength(5);
    expect({ gst: std.gstPercent, fuel: std.fuelPercent, codFlat: std.codFlat, codPercent: std.codPercent }).toEqual({
      gst: 18,
      fuel: 12,
      codFlat: 35,
      codPercent: 1.5,
    });

    // Local zone: within_city base 3500p + per-kg 2200p → ₹46 / ₹57 / ₹79, extra ₹11.
    const local = rowFor(std, "local");
    expect(local.slabs.map((s: any) => s.price)).toEqual([46, 57, 79]);
    expect(local.extraPer500g).toBe(11);

    expect(zones).toHaveLength(5);
    expect(zones.find((z: any) => z.id === "special").remote).toBe(true);
    expect(zones.find((z: any) => z.id === "metro").metro).toBe(true);
    expect(zones.every((z: any) => typeof z.tier === "number")).toBe(true);
  });
});

describe("M3 — rate-cards CRUD", () => {
  it("creates, reads, updates and deletes a custom card (persisted)", async () => {
    const t = await onboard("Beta Co", "b@beta.test");
    const auth = { authorization: `Bearer ${t}` };

    const created = await app.inject({
      method: "POST",
      url: "/v1/rate-cards",
      headers: auth,
      payload: { name: "Peak Season", slabs: [{ zoneCode: "metro", fromWeightG: 0, baseChargePaise: 6000, stepChargePaise: 2000 }] },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { card: { id: string; status: string } }).card.id;
    expect((created.json() as { card: { status: string } }).card.status).toBe("draft");

    // Appears in the read surface, mapped into the matrix.
    const list1 = await app.inject({ method: "GET", url: "/v1/rate-cards", headers: auth });
    const cards1 = (list1.json() as { cards: any[] }).cards;
    expect(cards1).toHaveLength(2);
    const custom = cards1.find((c) => c.id === id);
    expect(custom.editable).toBe(true);
    expect(rowFor(custom, "metro").slabs[0].price).toBe(60); // 6000p → ₹60

    // GET one
    const one = await app.inject({ method: "GET", url: `/v1/rate-cards/${id}`, headers: auth });
    expect((one.json() as { card: { name: string } }).card.name).toBe("Peak Season");

    // PATCH → activate + rename, persisted
    const patched = await app.inject({ method: "PATCH", url: `/v1/rate-cards/${id}`, headers: auth, payload: { name: "Peak 2026", status: "active" } });
    expect(patched.statusCode).toBe(200);
    const list2 = await app.inject({ method: "GET", url: "/v1/rate-cards", headers: auth });
    const custom2 = (list2.json() as { cards: any[] }).cards.find((c) => c.id === id);
    expect(custom2.name).toBe("Peak 2026");
    expect(custom2.status).toBe("published"); // active → published in the read surface

    // DELETE → soft-removed from the read surface
    const del = await app.inject({ method: "DELETE", url: `/v1/rate-cards/${id}`, headers: auth });
    expect(del.statusCode).toBe(200);
    const list3 = await app.inject({ method: "GET", url: "/v1/rate-cards", headers: auth });
    expect((list3.json() as { cards: any[] }).cards).toHaveLength(1);
  });

  it("protects the system-managed Standard card", async () => {
    const t = await onboard("Gamma Co", "g@gamma.test");
    const auth = { authorization: `Bearer ${t}` };
    const patch = await app.inject({ method: "PATCH", url: "/v1/rate-cards/standard", headers: auth, payload: { name: "Hacked" } });
    expect(patch.statusCode).toBe(400);
    const del = await app.inject({ method: "DELETE", url: "/v1/rate-cards/standard", headers: auth });
    expect(del.statusCode).toBe(400);
  });

  it("isolates custom cards between tenants (404-before-403)", async () => {
    const ta = await onboard("Iso A", "a@iso.test");
    const tb = await onboard("Iso B", "b@iso.test");
    const created = await app.inject({ method: "POST", url: "/v1/rate-cards", headers: { authorization: `Bearer ${ta}` }, payload: { name: "A Only" } });
    const id = (created.json() as { card: { id: string } }).card.id;

    const bList = await app.inject({ method: "GET", url: "/v1/rate-cards", headers: { authorization: `Bearer ${tb}` } });
    expect((bList.json() as { cards: any[] }).cards).toHaveLength(1); // only B's own Standard

    const bGet = await app.inject({ method: "GET", url: `/v1/rate-cards/${id}`, headers: { authorization: `Bearer ${tb}` } });
    expect(bGet.statusCode).toBe(404);
    const bPatch = await app.inject({ method: "PATCH", url: `/v1/rate-cards/${id}`, headers: { authorization: `Bearer ${tb}` }, payload: { name: "Nope" } });
    expect(bPatch.statusCode).toBe(404);
    const bDelete = await app.inject({ method: "DELETE", url: `/v1/rate-cards/${id}`, headers: { authorization: `Bearer ${tb}` } });
    expect(bDelete.statusCode).toBe(404);
  });
});
