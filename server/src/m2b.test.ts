import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { PermissionModel, PincodeModel, PlanModel } from "@/models/index.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { SEED_PINCODES } from "@/data/pincodes.data.js";
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
  await PincodeModel.insertMany(SEED_PINCODES.map((p) => ({ ...p, source: "manual", status: "active" })));
}

async function token() {
  await onboardCompany({ companyName: "Usage Co", ownerName: "Owner", ownerEmail: "u@acme.test", password: PW, emailVerified: true });
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "u@acme.test", password: PW } });
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

describe("M2b — usage + subscription", () => {
  it("aggregates apiLogs into summary/series/logs and reflects quota in subscription", async () => {
    const t = await token();
    const auth = { authorization: `Bearer ${t}` };

    // create a key
    const created = await app.inject({ method: "POST", url: "/v1/keys", headers: auth, payload: { name: "Usage Key", mode: "test" } });
    expect(created.statusCode).toBe(201);
    const secret = (created.json() as { secret: string }).secret;

    // make 3 keyed rate calls → generates apiLogs
    for (let i = 0; i < 3; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/v1/rates/calculate",
        headers: { authorization: `Bearer ${secret}` },
        payload: { origin: "110001", destination: "560001", weight: 500 + i, service: "surface" },
      });
      expect(r.statusCode).toBe(200);
    }

    // apiLog writes are fire-and-forget — poll until they land
    let summary: any;
    for (let i = 0; i < 40; i++) {
      const s = await app.inject({ method: "GET", url: "/v1/usage/summary", headers: auth });
      summary = (s.json() as any).data;
      if (summary.calls >= 3) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(summary.calls).toBe(3);
    expect(summary.active_keys).toBe(1);
    expect(summary.success_rate).toBe(1);

    const series = (await app.inject({ method: "GET", url: "/v1/usage/series?days=7", headers: auth }).then((r) => r.json())) as any;
    expect(series.data).toHaveLength(7);
    expect(series.data.reduce((a: number, d: any) => a + d.calls, 0)).toBe(3);

    const logs = (await app.inject({ method: "GET", url: "/v1/usage/logs?limit=5", headers: auth }).then((r) => r.json())) as any;
    expect(logs.data.length).toBe(3);
    expect(logs.data[0].endpoint).toBe("/v1/rates/calculate");
    expect(logs.data[0].detail?.zone).toBe("metro");

    const sub = (await app.inject({ method: "GET", url: "/v1/subscription", headers: auth }).then((r) => r.json())) as any;
    expect(sub.data.plan.code).toBe("free");
    expect(sub.data.usage.calls_used).toBe(3);
    expect(sub.data.usage.remaining).toBe(997);
  });

  it("usage requires auth", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/usage/summary" });
    expect(res.statusCode).toBe(401);
  });
});
