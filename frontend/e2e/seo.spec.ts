import { expect, test } from "@playwright/test";

/**
 * SEO surface tests — sitemap, robots, meta tags, structured data, OG image,
 * slug redirects and social links. These need only the frontend (the sitemap
 * degrades gracefully when the backend is down).
 */

test.describe("robots.txt", () => {
  test("allows public pages, blocks private areas, links the sitemap", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("User-Agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /app/");
    expect(body).toContain("Disallow: /admin/");
    expect(body).toContain("Disallow: /reset-password");
    expect(body).toContain("Sitemap:");
    expect(body).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  });
});

test.describe("sitemap.xml", () => {
  test("lists all public marketing routes", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("xml");
    const xml = await res.text();
    for (const path of ["/blog", "/features", "/pricing", "/docs", "/about", "/contact", "/signup", "/legal/terms", "/legal/privacy"]) {
      expect(xml, `sitemap should contain ${path}`).toContain(`${path}</loc>`);
    }
    // Private areas must never leak into the sitemap.
    expect(xml).not.toContain("/admin");
    expect(xml).not.toContain("/app/");
  });
});

test.describe("home page SEO", () => {
  test("has title, description, canonical, OG/Twitter tags and JSON-LD", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/Shipping Calculation API/i);

    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute("content", /shipping charges/i);

    const keywords = page.locator('meta[name="keywords"]');
    await expect(keywords).toHaveAttribute("content", /shipping calculation API/i);

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute("href", /^https?:\/\/[^/]+\/?$/);

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");

    // Organization + WebSite + SoftwareApplication JSON-LD graph.
    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(jsonLd).toBeTruthy();
    const parsed = JSON.parse(jsonLd!) as { "@graph": Array<{ "@type": string; sameAs?: string[] }> };
    const types = parsed["@graph"].map((n) => n["@type"]);
    expect(types).toEqual(expect.arrayContaining(["Organization", "WebSite", "SoftwareApplication"]));
    const org = parsed["@graph"].find((n) => n["@type"] === "Organization");
    expect(org?.sameAs?.length).toBeGreaterThanOrEqual(3);
  });

  test("serves the default OG image", async ({ page, request }) => {
    await page.goto("/");
    const ogUrl = await page.locator('meta[property="og:image"]').first().getAttribute("content");
    expect(ogUrl).toBeTruthy();
    // The meta content is an absolute production URL — fetch its path locally.
    const res = await request.get(new URL(ogUrl!).pathname);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });
});

test.describe("noindex on private/auth pages", () => {
  for (const path of ["/reset-password", "/forgot-password", "/verify-email"]) {
    test(`${path} is noindex`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    });
  }

  test("/signup is indexable with its own title", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveTitle(/Sign up/i);
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /index/);
    await expect(robots).not.toHaveAttribute("content", /noindex/);
  });
});

test.describe("slug redirects", () => {
  const cases: Array<[string, string]> = [
    ["/register", "/signup"],
    ["/sign-in", "/login"],
    ["/terms", "/legal/terms"],
    ["/privacy", "/legal/privacy"],
    ["/documentation", "/docs"],
    ["/plans", "/pricing"],
  ];
  for (const [from, to] of cases) {
    test(`${from} → ${to}`, async ({ request }) => {
      const res = await request.get(from, { maxRedirects: 0 });
      expect([301, 308]).toContain(res.status());
      expect(res.headers()["location"]).toContain(to);
    });
  }
});

test.describe("footer social links", () => {
  test("renders Twitter/X, LinkedIn, GitHub and Instagram links", async ({ page }) => {
    await page.goto("/");
    for (const icon of ["twitter", "linkedin", "github", "instagram"]) {
      const link = page.getByTestId(`footer-social-${icon}`);
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", /^https:\/\//);
      await expect(link).toHaveAttribute("rel", /noopener/);
    }
    await expect(page.getByTestId("footer-link-blog")).toHaveAttribute("href", "/blog");
  });
});

test.describe("blog list page", () => {
  test("renders with SEO meta (works with or without published posts)", async ({ page }) => {
    await page.goto("/blog");
    await expect(page).toHaveTitle(/Blog/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/blog$/);
    await expect(page.getByTestId("blog-page-heading")).toBeVisible();
    // Either the post grid/featured card or the empty state must render.
    const hasPosts = (await page.locator('[data-testid^="blog-card-"]').count()) > 0;
    if (!hasPosts) await expect(page.getByTestId("blog-empty-state")).toBeVisible();
  });
});
