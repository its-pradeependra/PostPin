import { expect, test, type Page } from "@playwright/test";

/**
 * Full blog lifecycle E2E — superadmin writes + publishes an article, the
 * public pages and sitemap pick it up with correct SEO meta, then cleanup.
 *
 * Requires the backend on :4000 with a seeded super admin. Credentials come
 * from E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (defaults = server dev seed).
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@postpin.dev";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "ChangeMe_Admin#2026";

// 1×1 red PNG for the cover-upload test.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const STAMP = Date.now().toString(36);
const TITLE = `E2E Shipping Guide ${STAMP}`;
const SLUG = `e2e-shipping-guide-${STAMP}`;
const META_TITLE = `E2E Meta Title ${STAMP} — Shipping API`;
const META_DESCRIPTION = `E2E meta description ${STAMP}: calculate shipping charges between Indian pincodes.`;
const META_KEYWORD = `e2e-keyword-${STAMP}`;

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  const email = page.getByTestId("login-email-input");
  try {
    await email.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    // Dev-server compile hiccup — one reload retry.
    await page.reload();
    await email.waitFor({ state: "visible", timeout: 15_000 });
  }
  await email.fill(ADMIN_EMAIL);
  await page.getByTestId("login-password-input").fill(ADMIN_PASSWORD);
  await page.getByTestId("login-submit-btn").click();
  await page.waitForURL(/\/(admin|app)/, { timeout: 20_000 });
}

test.describe.serial("blog publishing lifecycle", () => {
  test("superadmin creates a draft with SEO fields", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/blog");

    // Empty state and header both expose a create button; use whichever is visible.
    const createBtn = page.getByTestId("blog-create-btn");
    const emptyCreateBtn = page.getByTestId("blog-empty-create-btn");
    await expect(createBtn.or(emptyCreateBtn).first()).toBeVisible({ timeout: 15_000 });
    if (await emptyCreateBtn.isVisible().catch(() => false)) await emptyCreateBtn.click();
    else await createBtn.click();

    await expect(page.getByTestId("blog-editor-dialog")).toBeVisible();
    await page.getByTestId("blog-editor-title-input").fill(TITLE);
    // Slug auto-generates from the title; set it explicitly for determinism.
    await page.getByTestId("blog-editor-slug-input").fill(SLUG);
    await page
      .getByTestId("blog-editor-excerpt-input")
      .fill("An end-to-end test article about calculating shipping charges across India.");
    await page
      .getByTestId("blog-editor-content-input")
      .fill(
        "## Why rates matter\n\nShipping cost is the #1 checkout abandonment driver in Indian ecommerce.\n\n- Zone-based pricing\n- Weight slabs\n- COD surcharges\n\nUse the **Postpin API** to price parcels in one call.",
      );
    await page.getByTestId("blog-editor-tags-input").fill("e2e, guides");

    // Real cover image upload through the media pipeline.
    await page.getByTestId("blog-editor-cover-file-input").setInputFiles({
      name: "e2e-cover.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await expect(page.getByTestId("blog-editor-cover-input")).toHaveValue(/\/uploads\/blog\//, { timeout: 15_000 });
    await expect(page.getByTestId("blog-editor-cover-preview")).toBeVisible();

    await page.getByTestId("blog-editor-meta-title-input").fill(META_TITLE);
    await page.getByTestId("blog-editor-meta-description-input").fill(META_DESCRIPTION);
    await page.getByTestId("blog-editor-meta-keywords-input").fill(`${META_KEYWORD}, shipping api`);
    await page.getByTestId("blog-editor-submit-btn").click();

    await expect(page.getByTestId("blog-editor-dialog")).toBeHidden({ timeout: 15_000 });
    const row = page.locator(`[data-testid^="blog-row-"]`, { hasText: TITLE }).first();
    await expect(row).toBeVisible();
    await expect(row.locator('[data-testid^="blog-row-status-"]')).toHaveText("draft");
  });

  test("draft is NOT visible on the public blog", async ({ page }) => {
    const res = await page.goto(`/blog/${SLUG}`);
    expect(res?.status()).toBe(404);
  });

  test("superadmin publishes the article", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/blog");
    const row = page.locator(`[data-testid^="blog-row-"]`, { hasText: TITLE }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('[data-testid^="blog-row-actions-"]').click();
    await page.locator('[data-testid^="blog-action-publish-"]').click();
    await expect(row.locator('[data-testid^="blog-row-status-"]')).toHaveText("published", { timeout: 15_000 });
  });

  test("published article renders publicly with its SEO meta and JSON-LD", async ({ page }) => {
    await page.goto(`/blog/${SLUG}`);

    // Content
    await expect(page.getByTestId("blog-post-title")).toHaveText(TITLE);
    await expect(page.getByTestId("blog-post-content")).toContainText("Why rates matter");
    await expect(page.getByTestId("blog-post-content").locator("strong")).toContainText("Postpin API");
    await expect(page.getByTestId("blog-post-cta-btn")).toBeVisible();

    // The uploaded cover renders from the media pipeline.
    await expect(page.getByTestId("blog-post-cover")).toHaveAttribute("src", /\/uploads\/blog\//);

    // Per-post SEO meta from the admin-entered fields
    await expect(page).toHaveTitle(new RegExp(META_TITLE.slice(0, 30)));
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", META_DESCRIPTION);
    await expect(page.locator('meta[name="keywords"]')).toHaveAttribute("content", new RegExp(META_KEYWORD));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/blog/${SLUG}$`));
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");

    // BlogPosting JSON-LD
    const scripts = page.locator('script[type="application/ld+json"]');
    const payloads = await scripts.allTextContents();
    const article = payloads.map((p) => JSON.parse(p) as { "@type"?: string; headline?: string }).find((p) => p["@type"] === "BlogPosting");
    expect(article?.headline).toBe(TITLE);
  });

  test("published article appears on /blog and in sitemap.xml", async ({ page, request }) => {
    await page.goto("/blog");
    await expect(page.getByTestId(`blog-card-${SLUG}`)).toBeVisible();

    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain(`/blog/${SLUG}</loc>`);
  });

  test("per-post OG image uses the uploaded cover; generated OG route also serves", async ({ page, request }) => {
    await page.goto(`/blog/${SLUG}`);
    // With a cover set, the share image IS the uploaded cover.
    await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute(
      "content",
      /\/uploads\/blog\//,
    );
    // The uploaded file itself is downloadable.
    const cover = await page.getByTestId("blog-post-cover").getAttribute("src");
    const coverRes = await request.get(cover!);
    expect(coverRes.status()).toBe(200);
    expect(coverRes.headers()["content-type"]).toContain("image/png");
    // The generated gradient OG (used when a post has no cover) still serves.
    const res = await request.get(`/blog/${SLUG}/og`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });

  test("cleanup: superadmin deletes the article and its URL 404s", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/blog");
    const row = page.locator(`[data-testid^="blog-row-"]`, { hasText: TITLE }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('[data-testid^="blog-row-actions-"]').click();
    await page.locator('[data-testid^="blog-action-delete-"]').click();
    await page.getByRole("button", { name: "Delete article" }).click();
    await expect(row).toBeHidden({ timeout: 15_000 });

    const res = await page.goto(`/blog/${SLUG}`);
    expect(res?.status()).toBe(404);
  });
});
