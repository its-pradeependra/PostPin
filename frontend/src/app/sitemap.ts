import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { fetchBlogSitemap } from "@/lib/blog";
import { fetchStates, fetchStateDetail } from "@/lib/pincode-directory";

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
    { path: "/tools", priority: 0.8, changeFrequency: "monthly" },
    { path: "/tools/shipping-rate-calculator", priority: 0.8, changeFrequency: "monthly" },
    { path: "/tools/volumetric-weight-calculator", priority: 0.8, changeFrequency: "monthly" },
    { path: "/tools/pincode-lookup", priority: 0.8, changeFrequency: "monthly" },
    { path: "/pincodes", priority: 0.7, changeFrequency: "weekly" },
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

  // Pincode directory: state + district pages. Individual /pincode/<code>
  // pages (19k+) are deliberately left to crawling via the district pages.
  const states = (await fetchStates()) ?? [];
  const stateEntries: MetadataRoute.Sitemap = states.map((s) => ({
    url: `${site.url}/pincodes/${s.slug}`,
    lastModified,
    changeFrequency: "weekly",
    priority: 0.6,
  }));
  const stateDetails = await Promise.all(states.map((s) => fetchStateDetail(s.slug)));
  const districtEntries: MetadataRoute.Sitemap = stateDetails
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .flatMap((d) =>
      d.districts.map((dist) => ({
        url: `${site.url}/pincodes/${d.slug}/${dist.slug}`,
        lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      })),
    );

  return [...staticEntries, ...blogEntries, ...stateEntries, ...districtEntries];
}
