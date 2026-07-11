import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Reveal } from "@/components/marketing/reveal";
import { PincodeLookupWidget } from "./pincode-lookup-widget";

export const metadata: Metadata = pageMetadata({
  title: "Pincode Lookup — Check City, State & Delivery Serviceability",
  description:
    "Free pincode lookup for India: enter any 6-digit PIN code to see its city, district, state, metro/remote classification and prepaid/COD delivery serviceability — from a master synced nightly with India Post.",
  path: "/tools/pincode-lookup",
  keywords: [
    "pincode lookup",
    "pincode checker",
    "pin code search india",
    "pincode serviceability check",
    "check pincode delivery",
    "pincode city state finder",
  ],
});

const FAQS = [
  {
    q: "How do I find which city or state a pincode belongs to?",
    a: "Enter the 6-digit PIN code above — the lookup returns the area, district and state from the official India Post directory, refreshed nightly. The first digit identifies the postal region, the first three the sorting district.",
  },
  {
    q: "What does serviceability mean for a pincode?",
    a: "Whether shipments can actually be delivered there, and how: prepaid, Cash on Delivery, and pickup availability can each differ. Remote-area pincodes may also carry a courier surcharge and longer delivery SLAs.",
  },
  {
    q: "How current is this pincode data?",
    a: "The underlying master (19,000+ delivery pincodes) syncs against the official India Post directory every night at 00:30 IST, so new, changed and retired pincodes are reflected within a day.",
  },
];

function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export default function PincodeLookupPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd()) }} />

      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
        <div className="pointer-events-none absolute -top-28 left-1/2 -z-10 size-[40rem] -translate-x-1/2 rounded-full bg-brand-gradient opacity-[0.14] blur-[130px]" />
        <div className="mx-auto max-w-3xl px-4 pb-4 pt-16 text-center sm:px-6 lg:pt-20">
          <Reveal blur>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Free tool</p>
            <h1 className="mt-2 text-balance font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
              Pincode serviceability lookup
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
              City, district, state, metro/remote status and prepaid/COD serviceability for any Indian
              pincode — straight from a nightly-synced India Post master.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Widget ── */}
      <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Reveal>
          <PincodeLookupWidget />
        </Reveal>
      </section>

      {/* ── SEO copy + FAQ ── */}
      <section className="mx-auto max-w-3xl space-y-10 px-4 pb-20 sm:px-6">
        <div className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">Why serviceability matters</h2>
          <p className="leading-relaxed text-muted-foreground">
            &ldquo;Do you deliver to my pincode?&rdquo; is the first question Indian shoppers ask. Checking
            serviceability at address entry prevents failed orders, catches typos by auto-resolving city and
            state, and lets you show honest delivery estimates per lane. Browse all serviceable areas in the{" "}
            <Link href="/pincodes" className="font-medium text-primary hover:underline">
              pincode directory
            </Link>
            , or read{" "}
            <Link
              href="/blog/pincode-serviceability-check-why-your-checkout-needs-it"
              className="font-medium text-primary hover:underline"
            >
              why every checkout needs the check
            </Link>
            .
          </p>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-2xl font-semibold">Frequently asked questions</h2>
          {FAQS.map((f) => (
            <div key={f.q} className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-medium">{f.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
