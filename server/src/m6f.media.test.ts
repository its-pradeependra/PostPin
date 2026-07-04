import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { env } from "@/config/env.js";

// Isolate uploads to a temp dir BEFORE the app (and its static plugin) build.
const TMP_UPLOADS = path.join(os.tmpdir(), "postpin-test-uploads");
(env as { UPLOAD_DIR: string }).UPLOAD_DIR = TMP_UPLOADS;
(env as { API_PUBLIC_URL: string }).API_PUBLIC_URL = "http://localhost:4000";

import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { PermissionModel, PlanModel, UserModel } from "@/models/index.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { clearCollections, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";

const PW = "Sup3rSecret!pw";
let app: AppInstance;

async function seed() {
  await PermissionModel.insertMany(
    PERMISSIONS.map((p) => ({ key: p.key, resource: p.resource, action: p.action, group: p.group, scope: p.scope, description: p.description, isDangerous: "isDangerous" in p ? p.isDangerous : false })),
  );
  await PlanModel.create({ code: "free", version: 1, name: "Free", priceMonthlyPaise: 0, includedCalls: 1000, rateLimit: { rpm: 30, rpd: 0, burst: 10 }, maxApiKeys: 10, maxTeamMembers: 2, isActive: true, isPublic: true });
}

// A 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Build a multipart/form-data body for a single file field. */
function multipart(fieldName: string, filename: string, contentType: string, content: Buffer) {
  const boundary = "----postpintest" + fieldName;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, content, tail]), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function login(email: string) {
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password: PW } });
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
  fs.rmSync(TMP_UPLOADS, { recursive: true, force: true });
});
beforeEach(async () => {
  await clearCollections();
  await seed();
});

describe("M6f — avatar upload (local disk)", () => {
  it("uploads, persists avatarUrl, exposes it on /me, and can remove it", async () => {
    await onboardCompany({ companyName: "Pic Co", ownerName: "Owner", ownerEmail: "owner@pic.test", password: PW, emailVerified: true });
    const t = await login("owner@pic.test");

    const mp = multipart("file", "me.png", "image/png", PNG);
    const up = await app.inject({ method: "POST", url: "/v1/auth/avatar", headers: { ...auth(t), "content-type": mp.contentType }, payload: mp.body });
    expect(up.statusCode).toBe(200);
    const url = (up.json() as { avatar_url: string }).avatar_url;
    expect(url).toMatch(/\/uploads\/avatars\/.+\.png$/);

    // File really exists on disk.
    const rel = url.slice(url.indexOf("/uploads/") + "/uploads/".length);
    expect(fs.existsSync(path.join(TMP_UPLOADS, rel))).toBe(true);

    // /me reflects it.
    const me = await app.inject({ method: "GET", url: "/v1/auth/me", headers: auth(t) });
    expect((me.json() as { user: { avatar_url: string } }).user.avatar_url).toBe(url);

    // Remove.
    const del = await app.inject({ method: "DELETE", url: "/v1/auth/avatar", headers: auth(t) });
    expect(del.statusCode).toBe(200);
    const cleared = await UserModel.findOne({ email: "owner@pic.test" }).select("avatarUrl").lean();
    expect(cleared!.avatarUrl).toBeNull();
    expect(fs.existsSync(path.join(TMP_UPLOADS, rel))).toBe(false);
  });

  it("rejects a non-image file type (400)", async () => {
    await onboardCompany({ companyName: "Bad Co", ownerName: "O", ownerEmail: "o@bad.test", password: PW, emailVerified: true });
    const t = await login("o@bad.test");
    const mp = multipart("file", "note.txt", "text/plain", Buffer.from("hello"));
    const res = await app.inject({ method: "POST", url: "/v1/auth/avatar", headers: { ...auth(t), "content-type": mp.contentType }, payload: mp.body });
    expect(res.statusCode).toBe(400);
  });

  it("requires auth (401)", async () => {
    const mp = multipart("file", "me.png", "image/png", PNG);
    const res = await app.inject({ method: "POST", url: "/v1/auth/avatar", headers: { "content-type": mp.contentType }, payload: mp.body });
    expect(res.statusCode).toBe(401);
  });
});

describe("M6f — ticket attachments (local disk)", () => {
  it("uploads a file, attaches it to a ticket, and reads it back in the thread", async () => {
    await onboardCompany({ companyName: "Ticket Co", ownerName: "Owner", ownerEmail: "owner@tix.test", password: PW, emailVerified: true });
    const t = await login("owner@tix.test");

    // Upload → get attachment metadata.
    const mp = multipart("file", "screenshot.png", "image/png", PNG);
    const up = await app.inject({ method: "POST", url: "/v1/tickets/uploads", headers: { ...auth(t), "content-type": mp.contentType }, payload: mp.body });
    expect(up.statusCode).toBe(200);
    const attachment = (up.json() as { attachment: { url: string; name: string; size: number } }).attachment;
    expect(attachment.url).toMatch(/\/uploads\/tickets\/.+\.png$/);

    // Create a ticket carrying that attachment.
    const created = await app.inject({
      method: "POST",
      url: "/v1/tickets",
      headers: auth(t),
      payload: { subject: "Broken label", category: "api", priority: "high", body: "See attached screenshot please.", attachments: [attachment] },
    });
    expect(created.statusCode).toBe(201);
    const number = (created.json() as { ticket: { id: string } }).ticket.id;

    // Thread shows the attachment on the root message.
    const thread = await app.inject({ method: "GET", url: `/v1/tickets/${number}`, headers: auth(t) });
    const messages = (thread.json() as { ticket: { messages: Array<{ attachments: Array<{ name: string }> }> } }).ticket.messages;
    expect(messages[0]!.attachments[0]!.name).toBe("screenshot.png");
  });
});
