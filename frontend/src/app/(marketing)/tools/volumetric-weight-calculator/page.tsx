import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";
import { Reveal } from "@/components/marketing/reveal";
import { VolumetricCalculator } from "./volumetric-calculator";

export const metadata: Metadata = pageMetadata({
  title: "Volumetric Weight Calculator — India (÷5000 Formula)",
  description:
    "Free volumetric weight calculator for Indian couriers. Enter parcel dimensions to get volumetric and chargeable weight instantly using the (L×W×H)÷5000 formula — plus 4500 and 6000 divisors.",
  path: "/tools/volumetric-weight-calculator",
  keywords: [
    "volumetric weight calculator",
    "dimensional weight calculator india",
    "volumetric weight formula 5000",
    "chargeable weight calculator",
    "courier weight calculator",
    "parcel volume calculator",
  ],
});

const FAQS = [
  {
    q: "How is volumetric weight calculated in India?",
    a: "Multiply the parcel's length, width and height in centimetres and divide by 5000. The result is the volumetric weight in kilograms. Couriers bill the higher of this and the actual scale weight — called the chargeable weight.",
  },
  {
    q: "Why is my parcel billed heavier than it weighs?",
    a: "Because its volumetric weight exceeds its actual weight — the parcel takes more vehicle space than its mass justifies. Light but bulky items (cushions, shoes, toys) are almost always billed by volume.",
  },
  {
    q: "Which divisor should I use — 5000, 4500 or 6000?",
    a: "5000 is the standard for Indian domestic shipping across surface and air. A few express products use 4500, and some international lanes use 6000. Check your carrier's rate card; when in doubt, use 5000.",
  },
  {
    q: "How can I reduce volumetric weight?",
    a: "Use the smallest box that protects the product, switch soft goods to poly mailers, and compress items like bedding with vacuum bags. Because the formula multiplies three dimensions, small reductions on each side compound quickly.",
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

export default function VolumetricWeightCalculatorPage() {
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
              Volumetric weight calculator
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
              See what couriers will actually bill your parcel — volumetric weight, actual weight and the
              chargeable weight that decides the price.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Calculator ── */}
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Reveal>
          <VolumetricCalculator />
        </Reveal>
      </section>

      {/* ── SEO copy ── */}
      <section className="mx-auto max-w-3xl space-y-10 px-4 pb-20 sm:px-6">
        <div className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">How volumetric weight works</h2>
          <p className="leading-relaxed text-muted-foreground">
            A delivery van fills up by volume long before it reaches its weight limit, so couriers price
            the space a parcel occupies, not just its mass. Indian carriers compute{" "}
            <strong className="text-foreground">volumetric weight = (length × width × height in cm) ÷ 5000</strong>{" "}
            and bill whichever is higher: that figure or the scale weight. A 900 g pair of sneakers in a
            35×25×15 cm box has a volumetric weight of 2.63 kg — and is billed as 2.63 kg.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            If you quote shipping at checkout from actual weight alone, every bulky SKU silently loses you
            money. The{" "}
            <Link href="/tools/shipping-rate-calculator" className="font-medium text-primary hover:underline">
              shipping rate calculator
            </Link>{" "}
            applies this math automatically when you provide dimensions — as does the{" "}
            <Link href="/docs" className="font-medium text-primary hover:underline">
              {site.name} API
            </Link>{" "}
            on every rate call.
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

        <p className="text-sm text-muted-foreground">
          Related reading:{" "}
          <Link href="/blog/volumetric-weight-explained-dimensional-weight-india" className="font-medium text-primary hover:underline">
            Volumetric weight explained — why your 1 kg parcel is billed as 5 kg
          </Link>
        </p>
      </section>
    </>
  );
}
