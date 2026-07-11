# Blog seeder — 12 SEO articles

Publishes 12 ready-written blog posts (with branded banner images) to the Postpin
blog, dated across April–July 2026 so they read as an organic publishing history.

## What's in this folder

- `posts.mjs` — the 12 articles: content (markdown), excerpt, tags, meta title /
  description / keywords, and the target publish date for each.
- `banners/*.png` — one 1200×630 branded banner per post (filename = slug).
- `seed-blog.mjs` — the runner.

## Run it on the server

```bash
cd /var/www/Project/PostPin/server

# 1. sanity check — logs in, validates banners/dates, writes NOTHING
BLOG_ADMIN_PASSWORD='<super-admin password>' node scripts/seed-blog/seed-blog.mjs --dry-run

# 2. the real run
BLOG_ADMIN_PASSWORD='<super-admin password>' node scripts/seed-blog/seed-blog.mjs
```

Per post it: uploads the banner via `POST /v1/admin/blog/uploads` (file lands in the
server's normal uploads dir), creates the post with all SEO fields, publishes it,
then backdates `publishedAt` directly in Mongo (the API always stamps "now";
`MONGODB_URI` is read from `server/.env`). The byline is set to "Postpin Team".

## Behaviour & safety

- **Idempotent.** Already-**published** posts with a matching slug are skipped.
  Leftover **drafts** with a matching slug (e.g. from an interrupted run) are
  deleted and reseeded so the banner URL is always correct for this machine.
  Note: 4 such test drafts may exist from local testing — the run heals them.
- **Nothing is written on failure of pre-flight** (missing banner, bad date, bad login).
- The public blog is served fresh (`force-dynamic`) — posts are visible on
  `/blog` immediately; `/sitemap.xml` picks them up on next fetch.

## Env / flags

| | |
|---|---|
| `BLOG_ADMIN_PASSWORD` | required — super-admin password |
| `BLOG_ADMIN_EMAIL` | default `admin@postpin.dev` |
| `BLOG_ADMIN_TOTP` | only if that admin has 2FA — a current 6-digit code |
| `BLOG_API_BASE` | default `http://localhost:4000/v1` (the backend on the same box) |
| `--dry-run` | validate everything, write nothing |
| `--no-publish` | create as drafts only (no publish, no backdate) |
| `--delete-seeded` | delete every post whose slug matches `posts.mjs`, then exit |

## After it runs

1. Spot-check two posts on the live site (`/blog/<slug>`) — banner, date, author.
2. Optionally resubmit `sitemap.xml` in Google Search Console to speed up indexing.
