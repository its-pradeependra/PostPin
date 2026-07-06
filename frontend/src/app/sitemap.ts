import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { fetchBlogSitemap } from "@/lib/blog";

/**
 * Sitemap for all public, indexable routes — static pages plus every published
 * blog post. Private areas (/app, /admin) and transactional auth flows are
 * deliberately excluded and blocked in robots.ts.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const routes: {
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/blog", priority: 0.9, changeFrequency: "daily" },
    { path: "/features", priority: 0.9, changeFrequency: "weekly" },
    { path: "/pricing", priority: 0.9, changeFrequency: "weekly" },
    { path: "/docs", priority: 0.9, changeFrequency: "weekly" },
    { path: "/about", priority: 0.6, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.6, changeFrequency: "monthly" },
    { path: "/status", priority: 0.4, changeFrequency: "daily" },
    { path: "/signup", priority: 0.8, changeFrequency: "monthly" },
    { path: "/login", priority: 0.5, changeFrequency: "monthly" },
    { path: "/legal/terms", priority: 0.3, changeFrequency: "yearly" },
    { path: "/legal/privacy", priority: 0.3, changeFrequency: "yearly" },
  ];

  const staticEntries = routes.map(({ path, priority, changeFrequency }) => ({
    url: `${site.url}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency,
    priority,
  }));

  const blogPosts = await fetchBlogSitemap();
  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((p) => ({
    url: `${site.url}/blog/${p.slug}`,
    lastModified: new Date(p.updated_at ?? p.published_at),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticEntries, ...blogEntries];
}
