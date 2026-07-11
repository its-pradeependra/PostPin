import type { Metadata } from "next";
import { site, socialLinks } from "@/lib/site";

/**
 * Keywords shared by every public page. Per-page keywords are appended so each
 * page also targets its own long-tail queries.
 */
export const baseKeywords = [
  "shipping calculation API",
  "shipping calculator API",
  "shipping rate API",
  "shipping rate calculator",
  "shipping cost API",
  "courier charges calculator",
  "courier rate API",
  "pincode API India",
  "India Post pincode API",
  "pincode serviceability API",
  "logistics API India",
  "ecommerce shipping charges API",
  "delivery charge calculator API",
];

type PageSeoInput = {
  /** Page title WITHOUT the site name — the root template appends "· Postpin". */
  title: string;
  description: string;
  /** Canonical path starting with "/", e.g. "/pricing". */
  path: string;
  /** Extra long-tail keywords for this page (appended to the base set). */
  keywords?: string[];
  /** Set true for pages that must not appear in search results. */
  noIndex?: boolean;
};

/** Build a complete, consistent Metadata object for a public page. */
export function pageMetadata({
  title,
  description,
  path,
  keywords = [],
  noIndex = false,
}: PageSeoInput): Metadata {
  const url = `${site.url}${path === "/" ? "" : path}`;
  // Avoid "… · Postpin · Postpin" when the title already carries the brand.
  const socialTitle = title.includes(site.name) ? title : `${title} · ${site.name}`;
  return {
    title,
    description,
    keywords: [...baseKeywords, ...keywords],
    alternates: { canonical: url },
    openGraph: {
      title: socialTitle,
      description,
      url,
      siteName: site.name,
      type: "website",
      locale: "en_IN",
      // Explicit: config-level openGraph suppresses file-based image injection.
      images: [{ url: `${site.url}/opengraph-image`, width: 1200, height: 630, alt: socialTitle }],
    },
    twitter: {
      card: "summary_large_image",
      site: site.twitter,
      title: socialTitle,
      description,
      images: [`${site.url}/opengraph-image`],
    },
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-snippet": -1,
            "max-image-preview": "large",
            "max-video-preview": -1,
          },
        },
  };
}

/** JSON-LD for a blog article — helps Google show rich results. */
export function articleJsonLd(post: {
  title: string;
  slug: string;
  excerpt: string;
  cover_image: string | null;
  published_at: string;
  updated_at: string;
  author_name: string;
  tags: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    url: `${site.url}/blog/${post.slug}`,
    mainEntityOfPage: `${site.url}/blog/${post.slug}`,
    ...(post.cover_image ? { image: [post.cover_image] } : {}),
    datePublished: post.published_at,
    dateModified: post.updated_at,
    keywords: post.tags.join(", "),
    author: { "@type": "Person", name: post.author_name },
    publisher: {
      "@type": "Organization",
      name: site.name,
      logo: { "@type": "ImageObject", url: `${site.url}/favicon/web-app-manifest-512x512.png` },
    },
  };
}

/** JSON-LD structured data for the landing page (Organization + WebSite + product). */
export function landingJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${site.url}/#organization`,
        name: site.name,
        url: site.url,
        email: site.email,
        logo: `${site.url}/favicon/web-app-manifest-512x512.png`,
        sameAs: socialLinks.map((s) => s.href),
      },
      {
        "@type": "WebSite",
        "@id": `${site.url}/#website`,
        name: site.name,
        url: site.url,
        publisher: { "@id": `${site.url}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${site.url}/#software`,
        name: `${site.name} — Shipping Calculation API`,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        description: site.description,
        url: site.url,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "INR",
          description: "Free tier available — pay as you grow.",
        },
        publisher: { "@id": `${site.url}/#organization` },
      },
    ],
  };
}
