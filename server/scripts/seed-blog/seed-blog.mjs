#!/usr/bin/env node
/**
 * Postpin blog seeder — run ON THE SERVER from the server/ directory:
 *
 *   cd /var/www/Project/PostPin/server
 *   BLOG_ADMIN_PASSWORD='<superadmin password>' node scripts/seed-blog/seed-blog.mjs
 *
 * What it does, per post in posts.mjs:
 *   1. logs in as the super admin (API)            — needs blog:write
 *   2. uploads the banner PNG                       — POST /admin/blog/uploads
 *   3. creates the post with SEO meta               — POST /admin/blog
 *   4. publishes it                                 — PATCH /admin/blog/:id
 *   5. backdates publishedAt/createdAt/updatedAt    — direct Mongo (API can't set dates)
 *
 * Idempotent: posts whose slug already exists are skipped.
 *
 * Env / flags:
 *   BLOG_ADMIN_EMAIL     (default admin@postpin.dev)
 *   BLOG_ADMIN_PASSWORD  (required)
 *   BLOG_ADMIN_TOTP      (only if the admin has 2FA enabled — a current 6-digit code)
 *   BLOG_API_BASE        (default http://localhost:4000/v1 — the local backend)
 *   --dry-run            validate login + banners + dates, write nothing
 *   --no-publish         create as drafts only (no publish, no backdate)
 *   --delete-seeded      DELETE every post whose slug matches posts.mjs, then exit
 */

import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { POSTS } from "./posts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(HERE, "..", "..");
const API = (process.env.BLOG_API_BASE ?? "http://localhost:4000/v1").replace(/\/+$/, "");
const EMAIL = process.env.BLOG_ADMIN_EMAIL ?? "admin@postpin.dev";
const PASSWORD = process.env.BLOG_ADMIN_PASSWORD;
const TOTP = process.env.BLOG_ADMIN_TOTP;
const DRY = process.argv.includes("--dry-run");
const NO_PUBLISH = process.argv.includes("--no-publish");
const DELETE_SEEDED = process.argv.includes("--delete-seeded");

if (!PASSWORD) {
  console.error("Set BLOG_ADMIN_PASSWORD (the super-admin password). Nothing was changed.");
  process.exit(1);
}

/* ── tiny helpers ─────────────────────────────────────────────────────────── */

async function api(path, { method = "GET", token, body, formData } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const msg = json?.error?.message ?? json?.message ?? text ?? res.statusText;
    const err = new Error(`${method} ${path} → ${res.status}: ${msg}`);
    err.status = res.status;
    err.code = json?.error?.code;
    throw err;
  }
  return json;
}

/** Minimal .env parser (no dotenv dependency). */
function readEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/* ── auth ─────────────────────────────────────────────────────────────────── */

async function login() {
  const r = await api("/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  if (r.mfa_required) {
    if (!TOTP) {
      console.error("This admin has 2FA enabled — re-run with BLOG_ADMIN_TOTP=<current 6-digit code>.");
      process.exit(1);
    }
    const r2 = await api("/auth/login/2fa", { method: "POST", body: { mfa_token: r.mfa_token, code: TOTP } });
    return r2.access_token;
  }
  return r.access_token;
}

/* ── main ─────────────────────────────────────────────────────────────────── */

console.log(`Postpin blog seeder — ${POSTS.length} posts → ${API}`);
const token = await login();
console.log(`✓ logged in as ${EMAIL}`);

const existing = await api("/admin/blog", { token }).catch(() => ({ posts: [] }));
/** slug → { id, status } for every post already in the CMS. */
const existingBySlug = new Map((existing.posts ?? []).map((p) => [p.slug, { id: p.id, status: p.status }]));

if (DELETE_SEEDED) {
  let n = 0;
  for (const post of POSTS) {
    const match = (existing.posts ?? []).find((p) => p.slug === post.slug);
    if (!match) continue;
    await api(`/admin/blog/${match.id}`, { method: "DELETE", token });
    console.log(`✗ deleted ${post.slug}`);
    n++;
  }
  console.log(`Done — deleted ${n} seeded post(s).`);
  process.exit(0);
}

// Pre-flight: every banner must exist, every date must parse.
for (const post of POSTS) {
  const banner = join(HERE, "banners", `${post.slug}.png`);
  if (!existsSync(banner)) {
    console.error(`Missing banner: ${banner}. Nothing was changed.`);
    process.exit(1);
  }
  if (Number.isNaN(new Date(post.publishAt).getTime())) {
    console.error(`Bad publishAt on ${post.slug}. Nothing was changed.`);
    process.exit(1);
  }
}
console.log(`✓ pre-flight OK (${POSTS.length} banners, dates valid)`);

if (DRY) {
  for (const p of POSTS) {
    const ex = existingBySlug.get(p.slug);
    const state = !ex ? "would create" : ex.status === "published" ? "SKIP (published)" : "would RESEED (draft exists)";
    console.log(`  ${state}  ${p.publishAt}  ${p.slug}`);
  }
  console.log("Dry run — nothing written.");
  process.exit(0);
}

const created = []; // { slug, id, publishAt }

for (const post of POSTS) {
  const ex = existingBySlug.get(post.slug);
  if (ex?.status === "published") {
    console.log(`— skip (already published): ${post.slug}`);
    continue;
  }
  if (ex) {
    // A draft with this slug (e.g. from an interrupted earlier run) — replace it
    // wholesale so the banner is re-uploaded on THIS machine with a correct URL.
    await api(`/admin/blog/${ex.id}`, { method: "DELETE", token });
    console.log(`↻ reseeding stale draft: ${post.slug}`);
  }

  // 1. banner upload
  const buf = readFileSync(join(HERE, "banners", `${post.slug}.png`));
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: "image/png" }), `${post.slug}.png`);
  const up = await api("/admin/blog/uploads", { method: "POST", token, formData: fd });

  // 2. create
  const { post: doc } = await api("/admin/blog", {
    method: "POST",
    token,
    body: {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      cover_image: up.url,
      tags: post.tags,
      meta_title: post.metaTitle,
      meta_description: post.metaDescription,
      meta_keywords: post.metaKeywords,
    },
  });

  // 3. publish
  if (!NO_PUBLISH) {
    await api(`/admin/blog/${doc.id}`, { method: "PATCH", token, body: { status: "published" } });
  }

  created.push({ slug: post.slug, id: doc.id, publishAt: new Date(post.publishAt) });
  console.log(`✓ ${NO_PUBLISH ? "created (draft)" : "published"}: ${post.slug}`);
}

/* ── backdate via Mongo (the API always stamps publishedAt = now) ─────────── */

if (!NO_PUBLISH && created.length) {
  const env = readEnvFile(join(SERVER_DIR, ".env"));
  const uri = env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found in server/.env — posts are live but all dated today.");
    process.exit(1);
  }
  const { default: mongoose } = await import("mongoose");
  await mongoose.connect(uri, uri.includes("directConnection") ? {} : { directConnection: true });
  const col = mongoose.connection.db.collection("blogposts");
  for (const c of created) {
    await col.updateOne(
      { slug: c.slug },
      // authorName: the API stamps the logged-in admin's name ("Super Admin") —
      // the public byline should be the team, not the seed account.
      { $set: { publishedAt: c.publishAt, createdAt: c.publishAt, updatedAt: c.publishAt, authorName: "Postpin Team" } },
    );
    console.log(`✓ dated ${c.publishAt.toISOString().slice(0, 10)}: ${c.slug}`);
  }
  await mongoose.disconnect();
}

console.log(`\nDone — ${created.length} new post(s), ${POSTS.length - created.length} skipped.`);
if (!NO_PUBLISH && created.length) {
  console.log("The public blog is served fresh (force-dynamic) — posts are visible immediately.");
  console.log("Check: /blog on the site, and /sitemap.xml should list every slug.");
}
