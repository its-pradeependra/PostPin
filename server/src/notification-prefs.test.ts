import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { NotificationModel, PermissionModel, PlanModel, UserModel } from "@/models/index.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { createNotification } from "@/services/notification.service.js";
import { clearEmails, lastEmailFor } from "@/services/email.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { clearCollections, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";

const PW = "Sup3rSecret!pw";
const EMAIL = "owner@prefs.test";
let app: AppInstance;

async function seed() {
  await PermissionModel.insertMany(
    PERMISSIONS.map((p) => ({ key: p.key, resource: p.resource, action: p.action, group: p.group, scope: p.scope, description: p.description, isDangerous: "isDangerous" in p ? p.isDangerous : false })),
  );
  await PlanModel.create({ code: "free", version: 1, name: "Free", priceMonthlyPaise: 0, includedCalls: 1000, rateLimit: { rpm: 30, rpd: 0, burst: 10 }, maxApiKeys: 10, maxTeamMembers: 2, isActive: true, isPublic: true });
  await onboardCompany({ companyName: "Prefs Co", ownerName: "Owner", ownerEmail: EMAIL, password: PW, emailVerified: true });
}

async function login(): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: EMAIL, password: PW } });
  return (res.json() as { access_token: string }).access_token;
}
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

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
  clearEmails();
});

describe("Notification preferences", () => {
  it("returns sensible defaults and persists a PATCH", async () => {
    const t = await login();
    const res = await app.inject({ method: "GET", url: "/v1/notifications/preferences", headers: auth(t) });
    expect(res.statusCode).toBe(200);
    const prefs = (res.json() as { preferences: { email_enabled: boolean; kinds: Record<string, { in_app: boolean; email: boolean }> } }).preferences;
    expect(prefs.email_enabled).toBe(true);
    expect(prefs.kinds.billing).toEqual({ in_app: true, email: true });
    expect(prefs.kinds.key).toEqual({ in_app: true, email: false });

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/notifications/preferences",
      headers: auth(t),
      payload: { kinds: { key: { in_app: false }, sync: { email: true } } },
    });
    expect(patch.statusCode).toBe(200);
    const updated = (patch.json() as { preferences: { kinds: Record<string, { in_app: boolean; email: boolean }> } }).preferences;
    expect(updated.kinds.key!.in_app).toBe(false);
    expect(updated.kinds.sync!.email).toBe(true);

    // Persisted — a fresh GET returns the same.
    const again = await app.inject({ method: "GET", url: "/v1/notifications/preferences", headers: auth(t) });
    expect((again.json() as { preferences: { kinds: Record<string, { in_app: boolean }> } }).preferences.kinds.key!.in_app).toBe(false);
  });

  it("emails kinds with email enabled; suppresses kinds with in-app disabled", async () => {
    const user = await UserModel.findOne({ email: EMAIL });

    // billing → email default ON: creates the in-app row AND sends an email.
    await createNotification({ recipientId: user!._id, kind: "billing", type: "invoice.paid", title: "Invoice paid", body: "₹499 received." });
    expect(await NotificationModel.countDocuments({ recipientId: user!._id, kind: "billing" })).toBe(1);
    const mail = lastEmailFor(EMAIL);
    expect(mail?.subject).toContain("Invoice paid");

    // key → email default OFF: in-app row only, no new email.
    clearEmails();
    await createNotification({ recipientId: user!._id, kind: "key", type: "key.created", title: "New API key created" });
    expect(await NotificationModel.countDocuments({ recipientId: user!._id, kind: "key" })).toBe(1);
    expect(lastEmailFor(EMAIL)).toBeUndefined();

    // Disable key in-app → fully suppressed.
    const t = await login();
    await app.inject({ method: "PATCH", url: "/v1/notifications/preferences", headers: auth(t), payload: { kinds: { key: { in_app: false } } } });
    await createNotification({ recipientId: user!._id, kind: "key", type: "key.created", title: "Another key" });
    expect(await NotificationModel.countDocuments({ recipientId: user!._id, kind: "key" })).toBe(1); // unchanged

    // Master email switch off → billing no longer emails but still lands in-app.
    await app.inject({ method: "PATCH", url: "/v1/notifications/preferences", headers: auth(t), payload: { email_enabled: false } });
    clearEmails();
    await createNotification({ recipientId: user!._id, kind: "billing", type: "invoice.paid", title: "Second invoice" });
    expect(await NotificationModel.countDocuments({ recipientId: user!._id, kind: "billing" })).toBe(2);
    expect(lastEmailFor(EMAIL)).toBeUndefined();
  });
});
