import { site } from "@/lib/site";
import { fetchBlogPosts } from "@/lib/blog";

/**
 * /llms.txt — the llmstxt.org convention: a concise, markdown site guide for
 * AI assistants and their crawlers (GPTBot, ClaudeBot, PerplexityBot, …).
 * Generated live from site config, the public plans API and published blog
 * posts so it never drifts from reality.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

export const dynamic = "force-dynamic";

interface PublicPlan {
  code: string;
  name: string;
  description: string;
  price_monthly_paise: number;
  included_calls: number;
  rate_limit: { rpm: number };
}

async function fetchPlans(): Promise<PublicPlan[]> {
  try {
    const res = await fetch(`${API_BASE}/public/plans`, { cache: "no-store" });
    if (!res.ok) return [];
    const j = (await res.json()) as { data: PublicPlan[] };
    return j.data ?? [];
  } catch {
    return [];
  }
}

function planLine(p: PublicPlan): string {
  const price =
    p.price_monthly_paise < 0
      ? "custom pricing"
      : p.price_monthly_paise === 0
        ? "free"
        : `₹${(p.price_monthly_paise / 100).toLocaleString("en-IN")}/month`;
  const calls =
    p.included_calls === -1 ? "unlimited calls" : `${p.included_calls.toLocaleString("en-IN")} calls/month`;
  return `- ${p.name}: ${price}, ${calls}, ${p.rate_limit.rpm.toLocaleString("en-IN")} requests/min. ${p.description}`;
}

/** One line per post; excerpts flattened to a single line. */
function postLine(p: { title: string; slug: string; excerpt: string }): string {
  const excerpt = p.excerpt.replace(/\s+/g, " ").trim();
  return `- [${p.title}](${site.url}/blog/${p.slug})${excerpt ? `: ${excerpt}` : ""}`;
}

export async function GET() {
  const [plans, blog] = await Promise.all([fetchPlans(), fetchBlogPosts()]);

  const sections: string[] = [
    `# ${site.name}`,
    "",
    `> ${site.description}`,
    "",
    `${site.name} (${site.url}) is a shipping-rate API for the Indian market. It calculates door-to-door shipping charges between any two Indian pincodes — surface, air, express and same-day service levels — with zone-based pricing (within-city, state, metro, rest of India, special zones). The pincode master (19,000+ pincodes) is synced nightly from the official India Post directory. Developers authenticate with API keys (\`pp_live_\` / \`pp_test_\` prefixes) and are billed on flat monthly plans; calls beyond a plan's included quota are blocked, never silently charged — there are no overage fees.`,
    "",
    "## Docs",
    "",
    `- [API documentation](${site.url}/docs): Quickstart, authentication, request/response examples and error codes`,
    `- [API reference](${site.url}/docs#endpoints): POST /rates/calculate (shipping quotes), GET /serviceability/{pincode}, GET /pincodes (lookup/search)`,
    `- [API base URL](${site.apiBase}): All endpoints are versioned under /v1 and require a Bearer API key (public demo endpoints excepted)`,
    "",
    "## Product",
    "",
    `- [Features](${site.url}/features): Pincode coverage, rate cards, webhooks, usage analytics, team management`,
    `- [Pricing](${site.url}/pricing): Plan comparison, FAQs, GST invoicing details`,
    `- [Live demo](${site.url}/#calculator): Try a real quote between two pincodes without signing up`,
    `- [Status](${site.url}/status): Live uptime and API latency`,
    `- [Sign up](${site.url}/signup): Free plan, no credit card required`,
    "",
    "## Free tools",
    "",
    `- [Shipping rate calculator](${site.url}/tools/shipping-rate-calculator): Live courier charges between any two Indian pincodes`,
    `- [Volumetric weight calculator](${site.url}/tools/volumetric-weight-calculator): (L×W×H)÷5000 chargeable-weight math`,
    `- [Pincode lookup](${site.url}/tools/pincode-lookup): City, state and COD/prepaid serviceability for any PIN code`,
    `- [Pincode directory](${site.url}/pincodes): Every serviceable Indian pincode, browsable by state and district`,
  ];

  if (plans.length) {
    sections.push("", "## Plans", "", ...plans.map(planLine));
  }

  if (blog.posts.length) {
    sections.push("", "## Blog", "", ...blog.posts.map(postLine));
  }

  sections.push(
    "",
    "## Company",
    "",
    `- [About](${site.url}/about): Mission and company background`,
    `- [Contact](${site.url}/contact): Sales and support (${site.email})`,
    `- [Blog index](${site.url}/blog): Guides on shipping, logistics and the API`,
    "",
    "## Optional",
    "",
    `- [Terms of service](${site.url}/legal/terms): Usage terms, rate limits, SLA`,
    `- [Privacy policy](${site.url}/legal/privacy): Data handling and DPA`,
    `- [Sitemap](${site.url}/sitemap.xml): Machine-readable list of all public pages`,
    "",
  );

  return new Response(sections.join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
