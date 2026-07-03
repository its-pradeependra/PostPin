import http from "node:http";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { runWithContext } from "@/context/request-context.js";
import { PermissionModel, PlanModel } from "@/models/index.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import * as hooks from "@/services/webhook.service.js";
import { clearCollections, makeContext, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";

const PW = "Sup3rSecret!pw";
let app: AppInstance;

// A local HTTP receiver that captures the last delivery it received.
interface Captured { headers: http.IncomingHttpHeaders; body: string }
let received: Captured[] = [];
let receiver: http.Server;
let receiverUrl = "";
let failNext = false;

function startReceiver(): Promise<void> {
  return new Promise((resolve) => {
    receiver = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        if (failNext) {
          failNext = false;
          res.writeHead(500).end("nope");
        } else {
          res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
        }
      });
    });
    receiver.listen(0, "127.0.0.1", () => {
      const addr = receiver.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      receiverUrl = `http://127.0.0.1:${port}/hook`;
      resolve();
    });
  });
}

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
  await startReceiver();
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await new Promise<void>((r) => receiver.close(() => r()));
  await stopMemoryDb();
});
beforeEach(async () => {
  await clearCollections();
  received = [];
  failNext = false;
  await seed();
});

describe("M3 — webhooks routes (auth, CRUD, validation, isolation)", () => {
  it("requires authentication", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/webhooks" });
    expect(res.statusCode).toBe(401);
  });

  it("creates, lists, updates and deletes an endpoint", async () => {
    const t = await onboard("Alpha Co", "a@alpha.test");
    const auth = { authorization: `Bearer ${t}` };

    const created = await app.inject({
      method: "POST",
      url: "/v1/webhooks",
      headers: auth,
      payload: { url: "https://hooks.alpha.test/pp", events: ["rate.calculated", "invoice.paid"] },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as { secret: string; webhook: { id: string; secret_masked: string; events: string[] } };
    expect(body.secret).toMatch(/^whsec_/);
    expect(body.webhook.secret_masked).toMatch(/^whsec_•+/); // full secret never re-exposed
    expect(body.webhook.events).toEqual(["rate.calculated", "invoice.paid"]);
    const id = body.webhook.id;

    const list = await app.inject({ method: "GET", url: "/v1/webhooks", headers: auth });
    expect((list.json() as { webhooks: unknown[] }).webhooks).toHaveLength(1);

    const paused = await app.inject({ method: "PATCH", url: `/v1/webhooks/${id}`, headers: auth, payload: { status: "paused" } });
    expect(paused.statusCode).toBe(200);
    expect((paused.json() as { webhook: { status: string } }).webhook.status).toBe("paused");

    const del = await app.inject({ method: "DELETE", url: `/v1/webhooks/${id}`, headers: auth });
    expect(del.statusCode).toBe(200);
    const list2 = await app.inject({ method: "GET", url: "/v1/webhooks", headers: auth });
    expect((list2.json() as { webhooks: unknown[] }).webhooks).toHaveLength(0);
  });

  it("rejects non-HTTPS URLs and empty event lists", async () => {
    const t = await onboard("Beta Co", "b@beta.test");
    const auth = { authorization: `Bearer ${t}` };

    const httpUrl = await app.inject({ method: "POST", url: "/v1/webhooks", headers: auth, payload: { url: "http://insecure.test/x", events: ["rate.calculated"] } });
    expect(httpUrl.statusCode).toBe(400);

    const noEvents = await app.inject({ method: "POST", url: "/v1/webhooks", headers: auth, payload: { url: "https://ok.test/x", events: [] } });
    expect(noEvents.statusCode).toBe(400);
  });

  it("keeps endpoints isolated between tenants (404-before-403)", async () => {
    const ta = await onboard("Iso A", "a@iso.test");
    const tb = await onboard("Iso B", "b@iso.test");
    const created = await app.inject({ method: "POST", url: "/v1/webhooks", headers: { authorization: `Bearer ${ta}` }, payload: { url: "https://a.iso.test/pp", events: ["rate.calculated"] } });
    const id = (created.json() as { webhook: { id: string } }).webhook.id;

    const bList = await app.inject({ method: "GET", url: "/v1/webhooks", headers: { authorization: `Bearer ${tb}` } });
    expect((bList.json() as { webhooks: unknown[] }).webhooks).toHaveLength(0);

    const bPatch = await app.inject({ method: "PATCH", url: `/v1/webhooks/${id}`, headers: { authorization: `Bearer ${tb}` }, payload: { status: "disabled" } });
    expect(bPatch.statusCode).toBe(404);
    const bDelete = await app.inject({ method: "DELETE", url: `/v1/webhooks/${id}`, headers: { authorization: `Bearer ${tb}` } });
    expect(bDelete.statusCode).toBe(404);
  });
});

describe("M3 — webhook signed delivery (real outbound HTTP)", () => {
  it("delivers a correctly-signed test event, records it, and replays it", async () => {
    await runWithContext(makeContext(), async () => {
      const { secret, webhook } = await hooks.createWebhook({ url: receiverUrl, events: ["rate.calculated"] });

      const { delivery } = await hooks.testWebhook(webhook.id);
      expect(delivery.ok).toBe(true);
      expect(delivery.status).toBe(200);

      // The receiver got exactly one signed request.
      expect(received).toHaveLength(1);
      const got = received[0]!;
      expect(got.headers["x-postpin-event"]).toBe("rate.calculated");
      const sig = String(got.headers["x-postpin-signature"] ?? "");
      const m = sig.match(/^t=(\d+),v1=([0-9a-f]+)$/);
      expect(m).not.toBeNull();
      const [, ts, v1] = m!;
      const expected = createHmac("sha256", secret).update(`${ts}.${got.body}`).digest("hex");
      expect(v1).toBe(expected); // signature verifies against the one-time secret

      // Delivery is recorded and listable.
      const list = await hooks.listDeliveries(10);
      expect(list).toHaveLength(1);
      expect(list[0]!.ok).toBe(true);

      // Replaying re-sends as a fresh attempt.
      const replay = await hooks.replayDelivery(delivery.id);
      expect(replay.delivery.ok).toBe(true);
      expect(replay.delivery.attempt).toBe(2);
      expect(received).toHaveLength(2);
    });
  });

  it("records a failed delivery (non-2xx) and reflects it in the success rate", async () => {
    await runWithContext(makeContext(), async () => {
      const { webhook } = await hooks.createWebhook({ url: receiverUrl, events: ["rate.calculated"] });
      failNext = true;
      const { delivery } = await hooks.testWebhook(webhook.id);
      expect(delivery.ok).toBe(false);
      expect(delivery.status).toBe(500);

      const list = await hooks.listWebhooks();
      expect(list[0]!.success_rate).toBe(0); // 0 of 1 delivered
    });
  });
});
