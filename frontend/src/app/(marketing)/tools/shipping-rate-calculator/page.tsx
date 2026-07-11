import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Reveal } from "@/components/marketing/reveal";
import { RateCalculator } from "@/components/shipping/rate-calculator";

export const metadata: Metadata = pageMetadata({
  title: "Shipping Rate Calculator — Courier Charges Between Any Indian Pincodes",
  description:
    "Free shipping rate calculator for India. Get live courier charges between any two pincodes — zone-accurate freight, fuel surcharge, COD fee and GST included. Surface, air, express and same-day.",
  path: "/tools/shipping-rate-calculator",
  keywords: [
    "shipping rate calculator india",
    "courier charges calculator",
    "pincode to pincode shipping cost",
    "delivery charges calculator",
    "shipping cost calculator free",
    "courier rate finder",
  ],
});

const FAQS = [
  {
    q: "How accurate are these shipping rates?",
    a: "Quotes come from the live Postpin rate engine: the same zone resolution, weight slabs, fuel surcharge, COD fee and GST math that powers the paid API — computed against a pincode master synced nightly with India Post.",
  },
  {
    q: "What decides the price between two pincodes?",
    a: "The lane (within city, within state, metro-to-metro, rest of India, or special zones like the North-East), the chargeable weight (higher of actual and volumetric), the service level and the payment mode. GST at 18% applies on the subtotal.",
  },
  {
    q: "Can I get these rates inside my own checkout?",
    a: "Yes — this calculator is a thin UI over the public rate endpoint. With an API key you get the same quote as structured JSON in under 50 ms, itemised line by line. The free plan includes 1,000 calls a month.",
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

export default function ShippingRateCalculatorPage() {
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
              Shipping rate calculator
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
              Live courier charges between any two Indian pincodes — freight, fuel, COD and GST, itemised.
              Try surface, air, express or same-day.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Calculator ── */}
      <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Reveal>
          <RateCalculator />
        </Reveal>
      </section>

      {/* ── SEO copy + FAQ ── */}
      <section className="mx-auto max-w-3xl space-y-10 px-4 pb-20 sm:px-6">
        <div className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">How the quote is built</h2>
          <p className="leading-relaxed text-muted-foreground">
            Every quote resolves both pincodes against a live India Post master, maps the pair to a shipping
            zone, computes chargeable weight (add dimensions to include{" "}
            <Link href="/tools/volumetric-weight-calculator" className="font-medium text-primary hover:underline">
              volumetric weight
            </Link>
            ), applies the zone's weight slabs, then adds fuel surcharge, any COD or remote-area fee, and
            18% GST. What you see is the number a checkout should charge — not a teaser rate.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            Want to understand the math?{" "}
            <Link
              href="/blog/how-to-calculate-shipping-charges-between-indian-pincodes"
              className="font-medium text-primary hover:underline"
            >
              How shipping charges are calculated between Indian pincodes
            </Link>{" "}
            walks through every line with worked examples.
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
