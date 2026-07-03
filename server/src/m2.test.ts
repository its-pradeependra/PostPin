import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { PermissionModel, PincodeModel, PlanModel } from "@/models/index.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { calculateRate, classifyZone } from "@/services/rate-engine.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { SEED_PINCODES } from "@/data/pincodes.data.js";
import { clearCollections, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";

const PW = "Sup3rSecret!pw";
let app: AppInstance;

async function seedM2() {
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
  await PincodeModel.insertMany(SEED_PINCODES.map((p) => ({ ...p, source: "manual", status: "active" })));
}

async function loginToken(email: string): Promise<string> {
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
  await seedM2();
});

describe("M2 — rate engine", () => {
  const metro = { city: "", state: "", isMetro: true, serviceable: true };
  const nonMetro = { city: "", state: "", isMetro: false, serviceable: true };

  it("classifies zones", () => {
    expect(classifyZone("110001", "110002", metro, metro)).toBe("within_city"); // same first-3
    expect(classifyZone("110001", "116001", nonMetro, nonMetro)).toBe("within_state"); // same first-2
    expect(classifyZone("110001", "400001", metro, metro)).toBe("metro");
    expect(classifyZone("110001", "302001", metro, nonMetro)).toBe("roi");
    expect(classifyZone("190001", "110001", nonMetro, metro)).toBe("ne_jk"); // 19 = special
  });

  it("calculates a metro rate with GST and serviceability", async () => {
    const r = await calculateRate({ origin: "110001", destination: "400001", weightGrams: 1000, service: "surface" });
    expect(r.zone).toBe("metro");
    expect(r.total).toBeGreaterThan(0);
    expect(r.totalPaise).toBe(Math.round(r.total * 100));
    expect(r.breakdown.some((b) => b.label === "GST")).toBe(true);
    expect(r.serviceable).toBe(true);
  });

  it("express costs more than surface", async () => {
    const surface = await calculateRate({ origin: "110001", destination: "560001", weightGrams: 1000, service: "surface" });
    const express = await calculateRate({ origin: "110001", destination: "560001", weightGrams: 1000, service: "express" });
    expect(express.totalPaise).toBeGreaterThan(surface.totalPaise);
  });
});

describe("M2 — public endpoints", () => {
  it("POST /v1/public/rates/calculate returns a quote", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/public/rates/calculate",
      payload: { origin: "110001", destination: "400001", weight: 1000, service: "surface" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { total: number; zone: string }; meta: { request_id: string } };
    expect(body.data.total).toBeGreaterThan(0);
    expect(body.data.zone).toBe("metro");
    expect(body.meta.request_id).toBeTruthy();
  });

  it("serviceability + pincode lookup + plans", async () => {
    const s = await app.inject({ method: "GET", url: "/v1/public/serviceability/560001" });
    expect((s.json() as { data: { serviceable: boolean; found: boolean } }).data.found).toBe(true);

    const p = await app.inject({ method: "GET", url: "/v1/public/pincodes/560001" });
    expect((p.json() as { data: { city: string } }).data.city).toBe("Bengaluru");

    const missing = await app.inject({ method: "GET", url: "/v1/public/pincodes/999999" });
    expect(missing.statusCode).toBe(404);

    const plans = await app.inject({ method: "GET", url: "/v1/public/plans" });
    expect((plans.json() as { data: unknown[] }).data.length).toBeGreaterThanOrEqual(1);
  });
});

describe("M2 — API keys + key-auth", () => {
  async function tenantToken() {
    await onboardCompany({ companyName: "Key Co", ownerName: "Owner", ownerEmail: "keys@acme.test", password: PW, emailVerified: true });
    return loginToken("keys@acme.test");
  }

  it("create → list → use key on rate API → revoke → 401", async () => {
    const token = await tenantToken();

    // create
    const created = await app.inject({
      method: "POST",
      url: "/v1/keys",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "Prod key", mode: "test" },
    });
    expect(created.statusCode).toBe(201);
    const { secret, key } = created.json() as { secret: string; key: { id: string; masked: string } };
    expect(secret.startsWith("pp_test_")).toBe(true);
    expect(key.masked).toContain("…");

    // list
    const list = await app.inject({ method: "GET", url: "/v1/keys", headers: { authorization: `Bearer ${token}` } });
    expect((list.json() as { keys: unknown[] }).keys).toHaveLength(1);

    // use the key on the rate API
    const rate = await app.inject({
      method: "POST",
      url: "/v1/rates/calculate",
      headers: { authorization: `Bearer ${secret}` },
      payload: { origin: "110001", destination: "560001", weight: 500, service: "express" },
    });
    expect(rate.statusCode).toBe(200);
    expect((rate.json() as { data: { total: number } }).data.total).toBeGreaterThan(0);

    // no key → 401
    const noKey = await app.inject({
      method: "POST",
      url: "/v1/rates/calculate",
      payload: { origin: "110001", destination: "560001", weight: 500, service: "surface" },
    });
    expect(noKey.statusCode).toBe(401);

    // revoke → key no longer works
    const revoke = await app.inject({ method: "POST", url: `/v1/keys/${key.id}/revoke`, headers: { authorization: `Bearer ${token}` } });
    expect(revoke.statusCode).toBe(200);

    const afterRevoke = await app.inject({
      method: "POST",
      url: "/v1/rates/calculate",
      headers: { authorization: `Bearer ${secret}` },
      payload: { origin: "110001", destination: "560001", weight: 500, service: "surface" },
    });
    expect(afterRevoke.statusCode).toBe(401);
  });

  it("keys are tenant-isolated (tenant B cannot see tenant A's key)", async () => {
    const tokenA = await tenantToken();
    await app.inject({ method: "POST", url: "/v1/keys", headers: { authorization: `Bearer ${tokenA}` }, payload: { name: "A key", mode: "test" } });

    await onboardCompany({ companyName: "B Co", ownerName: "B", ownerEmail: "b@beta.test", password: PW, emailVerified: true });
    const tokenB = await loginToken("b@beta.test");
    const listB = await app.inject({ method: "GET", url: "/v1/keys", headers: { authorization: `Bearer ${tokenB}` } });
    expect((listB.json() as { keys: unknown[] }).keys).toHaveLength(0);
  });
});
