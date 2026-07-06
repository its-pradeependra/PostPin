import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { ApiLogModel, PermissionModel, PincodeModel, PlanModel } from "@/models/index.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { SEED_PINCODES } from "@/data/pincodes.data.js";
import { clearCollections, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";

const PW = "Sup3rSecret!pw";
let app: AppInstance;

async function seed() {
  await PermissionModel.insertMany(
    PERMISSIONS.map((p) => ({ key: p.key, resource: p.resource, action: p.action, group: p.group, scope: p.scope, description: p.description, isDangerous: "isDangerous" in p ? p.isDangerous : false })),
  );
  await PlanModel.create({ code: "free", version: 1, name: "Free", priceMonthlyPaise: 0, includedCalls: 1000, rateLimit: { rpm: 30, rpd: 0, burst: 10 }, maxApiKeys: 10, maxTeamMembers: 2, isActive: true, isPublic: true });
  await PincodeModel.insertMany(SEED_PINCODES.map((p) => ({ ...p, source: "manual", status: "active" })));
}

/** Onboard a tenant, log in, mint an API key — returns the key secret. */
async function tenantWithKey(): Promise<string> {
  await onboardCompany({ companyName: "Lookup Co", ownerName: "Owner", ownerEmail: "o@lookup.test", password: PW, emailVerified: true });
  const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "o@lookup.test", password: PW } });
  const token = (login.json() as { access_token: string }).access_token;
  const created = await app.inject({
    method: "POST",
    url: "/v1/keys",
    headers: { authorization: `Bearer ${token}` },
    payload: { name: "Lookup key", mode: "live" },
  });
  return (created.json() as { secret: string }).secret;
}

const keyAuth = (secret: string) => ({ authorization: `Bearer ${secret}` });

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

describe("Keyed lookups — /v1/serviceability & /v1/pincodes", () => {
  it("GET /v1/serviceability/:pin returns real data and logs a billable call", async () => {
    const secret = await tenantWithKey();
    const res = await app.inject({ method: "GET", url: "/v1/serviceability/110001", headers: keyAuth(secret) });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { serviceable: boolean; found: boolean; city: string | null } };
    expect(body.data.found).toBe(true);
    expect(body.data.serviceable).toBe(true);

    // The call landed in apiLogs as billable → it counts toward the quota.
    // (The log write is fire-and-forget, so give it a beat to settle.)
    await new Promise((r) => setTimeout(r, 150));
    const log = await ApiLogModel.findOne({ endpoint: "/v1/serviceability/:pin" }).lean();
    expect(log).toBeTruthy();
    expect(log!.billable).toBe(true);
    expect(log!.statusCode).toBe(200);
  });

  it("GET /v1/pincodes?q= searches by city and by pincode prefix", async () => {
    const secret = await tenantWithKey();

    const byCity = await app.inject({ method: "GET", url: "/v1/pincodes?q=jaipur&limit=5", headers: keyAuth(secret) });
    expect(byCity.statusCode).toBe(200);
    const cityBody = byCity.json() as { data: Array<{ pincode: string; city: string }> };
    expect(cityBody.data.length).toBeGreaterThan(0);
    expect(cityBody.data.every((p) => /jaipur/i.test(p.city))).toBe(true);

    const byPrefix = await app.inject({ method: "GET", url: "/v1/pincodes?q=1100&limit=5", headers: keyAuth(secret) });
    const prefixBody = byPrefix.json() as { data: Array<{ pincode: string }> };
    expect(prefixBody.data.length).toBeGreaterThan(0);
    expect(prefixBody.data.every((p) => p.pincode.startsWith("1100"))).toBe(true);
  });

  it("GET /v1/pincodes/:code returns detail; unknown pin 404s; both require a key", async () => {
    const secret = await tenantWithKey();

    const detail = await app.inject({ method: "GET", url: "/v1/pincodes/110001", headers: keyAuth(secret) });
    expect(detail.statusCode).toBe(200);
    expect((detail.json() as { data: { pincode: string } }).data.pincode).toBe("110001");

    expect((await app.inject({ method: "GET", url: "/v1/pincodes/999999", headers: keyAuth(secret) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/v1/serviceability/110001" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/v1/pincodes?q=jaipur" })).statusCode).toBe(401);
  });

  it("usage summary reflects keyed lookup calls (public calls never count)", async () => {
    const secret = await tenantWithKey();

    // Public calls: anonymous, never billable.
    await app.inject({ method: "POST", url: "/v1/public/rates/calculate", payload: { origin: "110001", destination: "400001", weight: 500 } });
    await new Promise((r) => setTimeout(r, 150));
    expect(await ApiLogModel.countDocuments({ billable: true })).toBe(0);

    // Keyed calls: counted.
    await app.inject({ method: "GET", url: "/v1/serviceability/110001", headers: keyAuth(secret) });
    await app.inject({ method: "POST", url: "/v1/rates/calculate", headers: keyAuth(secret), payload: { origin: "110001", destination: "400001", weight: 500 } });
    await new Promise((r) => setTimeout(r, 150));
    expect(await ApiLogModel.countDocuments({ billable: true })).toBe(2);
  });
});
