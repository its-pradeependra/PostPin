/** Global site / brand configuration. Single source of truth for naming and nav.
 *
 *  The public domain is managed via env — set these in the production env:
 *    NEXT_PUBLIC_SITE_URL         e.g. https://postpin.in  (canonicals/sitemap/OG/JSON-LD)
 *    NEXT_PUBLIC_API_DISPLAY_URL  e.g. https://api.postpin.in/v1  (shown in docs/code samples)
 *    NEXT_PUBLIC_CONTACT_EMAIL / NEXT_PUBLIC_SUPPORT_EMAIL  (default to hello@/support@ the site host)
 */

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://postpin.in").replace(/\/+$/, "");

/** Bare host of the public site, e.g. "postpin.in". */
export const siteHost = new URL(SITE_URL).host;

export const site = {
  name: "Postpin",
  tagline: "The shipping rate API for India.",
  description:
    "Calculate accurate shipping charges between any two Indian pincodes in a single API call. Postpin keeps its pincode master in sync with India Post automatically.",
  url: SITE_URL,
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? `hello@${siteHost}`,
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? `support@${siteHost}`,
  twitter: "@postpin",
  /** Display-only API base for docs/code samples (the app calls NEXT_PUBLIC_API_URL). */
  apiBase: (process.env.NEXT_PUBLIC_API_DISPLAY_URL ?? `https://api.${siteHost}/v1`).replace(/\/+$/, ""),
} as const;

/** Public social profiles — rendered in the footer and emitted as JSON-LD `sameAs`. */
export const socialLinks: { name: string; icon: "twitter" | "linkedin" | "github" | "instagram"; href: string }[] = [
  { name: "Twitter / X", icon: "twitter", href: "https://twitter.com/postpin" },
  { name: "LinkedIn", icon: "linkedin", href: "https://www.linkedin.com/company/postpin" },
  { name: "GitHub", icon: "github", href: "https://github.com/postpin-dev" },
  { name: "Instagram", icon: "instagram", href: "https://www.instagram.com/postpin" },
];

export type NavItem = {
  title: string;
  href: string;
  description?: string;
};

/** Public marketing navigation. */
export const marketingNav: NavItem[] = [
  { title: "Product", href: "/#features" },
  { title: "Pricing", href: "/pricing" },
  { title: "Docs", href: "/docs" },
  { title: "Features", href: "/features" },
  { title: "Blog", href: "/blog" },
  { title: "Contact", href: "/contact" },
];

export const marketingFooter: { heading: string; links: NavItem[] }[] = [
  {
    heading: "Product",
    links: [
      { title: "Features", href: "/features" },
      { title: "Pricing", href: "/pricing" },
      { title: "Free tools", href: "/tools" },
      { title: "Live demo", href: "/#calculator" },
      { title: "Changelog", href: "/docs#changelog" },
    ],
  },
  {
    heading: "Developers",
    links: [
      { title: "Documentation", href: "/docs" },
      { title: "API reference", href: "/docs#endpoints" },
      { title: "Pincode directory", href: "/pincodes" },
      { title: "Status", href: "/status" },
      { title: "Quickstart", href: "/docs#quickstart" },
    ],
  },
  {
    heading: "Company",
    links: [
      { title: "About", href: "/about" },
      { title: "Contact", href: "/contact" },
      { title: "Blog", href: "/blog" },
      { title: "Careers", href: "/about#careers" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { title: "Terms", href: "/legal/terms" },
      { title: "Privacy", href: "/legal/privacy" },
      { title: "DPA", href: "/legal/privacy#dpa" },
      { title: "SLA", href: "/legal/terms#sla" },
    ],
  },
];
