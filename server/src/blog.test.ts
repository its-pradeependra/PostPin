import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AppInstance, buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";
import { hashPassword } from "@/lib/crypto.js";
import { PermissionModel, PlanModel, RoleModel, UserModel } from "@/models/index.js";
import { onboardCompany } from "@/services/company-onboard.service.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { PLATFORM_ROLES } from "@/shared/roles.js";
import { clearCollections, startMemoryDb, stopMemoryDb } from "@/test/helpers.js";

const PW = "Sup3rSecret!pw";
const ADMIN = "root@postpin.test";
let app: AppInstance;

async function seed() {
  await PermissionModel.insertMany(
    PERMISSIONS.map((p) => ({ key: p.key, resource: p.resource, action: p.action, group: p.group, scope: p.scope, description: p.description, isDangerous: "isDangerous" in p ? p.isDangerous : false })),
  );
  const perms = await PermissionModel.find().select("key").lean();
  const permIdByKey = new Map(perms.map((p) => [p.key, p._id]));
  for (const r of PLATFORM_ROLES) {
    await RoleModel.create({ companyId: null, key: r.key, name: r.name, scope: "platform", isSystem: true, permissionIds: r.permissions.map((k) => permIdByKey.get(k)).filter(Boolean) });
  }
  const superRole = await RoleModel.findOne({ companyId: null, key: "super_admin" });
  await UserModel.create({ companyId: null, email: ADMIN, name: "Root Admin", passwordHash: await hashPassword(PW), roleId: superRole!._id, isPlatformStaff: true, status: "active", emailVerifiedAt: new Date() });
  await PlanModel.create({ code: "free", name: "Free", description: "Free", priceMonthlyPaise: 0, priceYearlyPaise: 0, includedCalls: 1000, maxApiKeys: 10, maxTeamMembers: 2, sortOrder: 0, version: 1, rateLimit: { rpm: 30, rpd: 0, burst: 10 }, isActive: true, isPublic: true });
}

async function login(email: string, password = PW) {
  const res = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email, password } });
  return (res.json() as { access_token?: string }).access_token;
}
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

const POST_BODY = {
  title: "How to Calculate Shipping Charges in India",
  excerpt: "A practical guide to calculating shipping charges between any two Indian pincodes using a shipping calculation API.",
  content: "## Why shipping rates are hard\n\nCourier rate sheets differ by zone, weight slab and service level. ".repeat(5),
  tags: ["guides", "shipping-api"],
  meta_title: "Calculate Shipping Charges in India — Guide",
  meta_description: "Step-by-step guide to calculating shipping charges between Indian pincodes with an API.",
  meta_keywords: ["shipping calculation api", "shipping charges india"],
};

type PostDto = {
  id: string; title: string; slug: string; status: string; published_at: string | null;
  meta_keywords: string[]; reading_time_mins: number; author_name: string;
};

async function createPost(token: string, overrides: Record<string, unknown> = {}) {
  const res = await app.inject({ method: "POST", url: "/v1/admin/blog", headers: auth(token), payload: { ...POST_BODY, ...overrides } });
  return { res, post: (res.json() as { post: PostDto }).post };
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

describe("Blog — admin CRUD (blog:write)", () => {
  it("creates a draft with an auto-generated slug and SEO fields", async () => {
    const adminT = (await login(ADMIN))!;
    const { res, post } = await createPost(adminT);
    expect(res.statusCode).toBe(201);
    expect(post.slug).toBe("how-to-calculate-shipping-charges-in-india");
    expect(post.status).toBe("draft");
    expect(post.published_at).toBeNull();
    expect(post.meta_keywords).toEqual(["shipping calculation api", "shipping charges india"]);
    expect(post.reading_time_mins).toBeGreaterThanOrEqual(1);
    expect(post.author_name).toBe("Root Admin");
  });

  it("blocks tenants and anonymous callers", async () => {
    await onboardCompany({ companyName: "Blogless Co", ownerName: "Owner", ownerEmail: "o@blog.test", password: PW, emailVerified: true });
    const tenantT = (await login("o@blog.test"))!;
    expect((await app.inject({ method: "GET", url: "/v1/admin/blog", headers: auth(tenantT) })).statusCode).toBe(403);
    expect((await createPost(tenantT)).res.statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/v1/admin/blog" })).statusCode).toBe(401);
  });

  it("rejects duplicate slugs and invalid bodies", async () => {
    const adminT = (await login(ADMIN))!;
    expect((await createPost(adminT)).res.statusCode).toBe(201);
    expect((await createPost(adminT)).res.statusCode).toBe(409);
    const bad = await app.inject({ method: "POST", url: "/v1/admin/blog", headers: auth(adminT), payload: { title: "x", excerpt: "short", content: "tiny" } });
    expect(bad.statusCode).toBe(400);
  });

  it("publishes (stamps published_at once), updates and deletes", async () => {
    const adminT = (await login(ADMIN))!;
    const { post } = await createPost(adminT);

    const pub = await app.inject({ method: "PATCH", url: `/v1/admin/blog/${post.id}`, headers: auth(adminT), payload: { status: "published" } });
    const published = (pub.json() as { post: PostDto }).post;
    expect(published.status).toBe("published");
    expect(published.published_at).toBeTruthy();

    // Unpublish → republish keeps the original published_at.
    await app.inject({ method: "PATCH", url: `/v1/admin/blog/${post.id}`, headers: auth(adminT), payload: { status: "draft" } });
    const repub = await app.inject({ method: "PATCH", url: `/v1/admin/blog/${post.id}`, headers: auth(adminT), payload: { status: "published" } });
    expect((repub.json() as { post: PostDto }).post.published_at).toBe(published.published_at);

    const upd = await app.inject({ method: "PATCH", url: `/v1/admin/blog/${post.id}`, headers: auth(adminT), payload: { title: "Updated Title", meta_keywords: ["new keyword"] } });
    expect((upd.json() as { post: PostDto }).post.title).toBe("Updated Title");

    expect((await app.inject({ method: "DELETE", url: `/v1/admin/blog/${post.id}`, headers: auth(adminT) })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/v1/admin/blog/${post.id}`, headers: auth(adminT) })).statusCode).toBe(404);
  });
});

describe("Blog — public read", () => {
  it("lists only published posts, newest first, with pagination meta", async () => {
    const adminT = (await login(ADMIN))!;
    const a = (await createPost(adminT)).post;
    await createPost(adminT, { title: "Draft Only Post", slug: "draft-only" });
    await app.inject({ method: "PATCH", url: `/v1/admin/blog/${a.id}`, headers: auth(adminT), payload: { status: "published" } });

    const res = await app.inject({ method: "GET", url: "/v1/public/blog" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ slug: string }>; meta: { total: number } };
    expect(body.meta.total).toBe(1);
    expect(body.data.map((p) => p.slug)).toEqual([a.slug]);
    // List items must not ship full content.
    expect((body.data[0] as Record<string, unknown>).content).toBeUndefined();
  });

  it("serves a published post by slug with SEO meta; hides drafts", async () => {
    const adminT = (await login(ADMIN))!;
    const { post } = await createPost(adminT);
    expect((await app.inject({ method: "GET", url: `/v1/public/blog/${post.slug}` })).statusCode).toBe(404);

    await app.inject({ method: "PATCH", url: `/v1/admin/blog/${post.id}`, headers: auth(adminT), payload: { status: "published" } });
    const res = await app.inject({ method: "GET", url: `/v1/public/blog/${post.slug}` });
    expect(res.statusCode).toBe(200);
    const detail = (res.json() as { data: { meta_title: string; content: string; meta_keywords: string[] } }).data;
    expect(detail.meta_title).toBe(POST_BODY.meta_title);
    expect(detail.content).toContain("Why shipping rates are hard");
    expect(detail.meta_keywords).toContain("shipping calculation api");
  });

  it("exposes published slugs for the frontend sitemap", async () => {
    const adminT = (await login(ADMIN))!;
    const { post } = await createPost(adminT);
    await app.inject({ method: "PATCH", url: `/v1/admin/blog/${post.id}`, headers: auth(adminT), payload: { status: "published" } });
    await createPost(adminT, { title: "Never Published", slug: "never-published" });

    const res = await app.inject({ method: "GET", url: "/v1/public/blog/sitemap" });
    const slugs = (res.json() as { data: Array<{ slug: string }> }).data.map((s) => s.slug);
    expect(slugs).toEqual([post.slug]);
  });
});
