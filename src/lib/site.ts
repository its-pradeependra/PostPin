/** Global site / brand configuration. Single source of truth for naming and nav. */

export const site = {
  name: "Postpin",
  tagline: "The shipping rate API for India.",
  description:
    "Calculate accurate shipping charges between any two Indian pincodes in a single API call. Postpin keeps its pincode master in sync with India Post automatically.",
  url: "https://postpin.dev",
  email: "hello@postpin.dev",
  supportEmail: "support@postpin.dev",
  twitter: "@postpin",
  apiBase: "https://api.postpin.dev/v1",
} as const;

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
  { title: "Contact", href: "/contact" },
];

export const marketingFooter: { heading: string; links: NavItem[] }[] = [
  {
    heading: "Product",
    links: [
      { title: "Features", href: "/features" },
      { title: "Pricing", href: "/pricing" },
      { title: "Live demo", href: "/#calculator" },
      { title: "Changelog", href: "/docs#changelog" },
    ],
  },
  {
    heading: "Developers",
    links: [
      { title: "Documentation", href: "/docs" },
      { title: "API reference", href: "/docs#endpoints" },
      { title: "Status", href: "/status" },
      { title: "Quickstart", href: "/docs#quickstart" },
    ],
  },
  {
    heading: "Company",
    links: [
      { title: "About", href: "/about" },
      { title: "Contact", href: "/contact" },
      { title: "Blog", href: "/about#blog" },
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
