import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { Reveal } from "@/components/marketing/reveal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";

export const metadata: Metadata = pageMetadata({
  title: "Free Shipping Tools — Rate Calculator, Volumetric Weight & Pincode Lookup",
  description:
    "Free logistics tools for Indian ecommerce: shipping rate calculator between any two pincodes, volumetric weight calculator, and pincode serviceability lookup. No sign-up required.",
  path: "/tools",
  keywords: [
    "free shipping tools",
    "shipping calculator india free",
    "volumetric weight calculator",
    "pincode lookup tool",
    "courier charges calculator free",
  ],
});

const TOOLS: {
  href: string;
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  desc: string;
  testId: string;
}[] = [
  {
    href: "/tools/shipping-rate-calculator",
    icon: "calculator",
    title: "Shipping Rate Calculator",
    desc: "Live door-to-door shipping charges between any two Indian pincodes — zone, surcharges and GST included.",
    testId: "tools-card-rate-calculator",
  },
  {
    href: "/tools/volumetric-weight-calculator",
    icon: "boxes",
    title: "Volumetric Weight Calculator",
    desc: "Enter parcel dimensions and see the volumetric and chargeable weight couriers will actually bill you for.",
    testId: "tools-card-volumetric",
  },
  {
    href: "/tools/pincode-lookup",
    icon: "pin",
    title: "Pincode Serviceability Lookup",
    desc: "Check any Indian pincode: city, state, district, metro/remote status and prepaid/COD serviceability.",
    testId: "tools-card-pincode-lookup",
  },
  {
    href: "/pincodes",
    icon: "map",
    title: "Pincode Directory",
    desc: "Browse every serviceable pincode in India, organised by state and district — kept in nightly sync with India Post.",
    testId: "tools-card-pincode-directory",
  },
];

export default function ToolsPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
        <div className="pointer-events-none absolute -top-28 left-1/2 -z-10 size-[40rem] -translate-x-1/2 rounded-full bg-brand-gradient opacity-[0.14] blur-[130px]" />
        <div className="mx-auto max-w-3xl px-4 pb-4 pt-16 text-center sm:px-6 lg:pt-24">
          <Reveal blur>
            <h1 className="text-balance font-display text-[2.75rem] font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Free shipping tools <span className="text-gradient">for Indian ecommerce.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
              The calculators and lookups every store, seller and developer needs — powered by the same
              engine and live pincode master behind the Postpin API. No sign-up needed.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Tool cards ── */}
      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2">
          {TOOLS.map((t, i) => (
            <Reveal key={t.href} as="div" index={i}>
              <Link href={t.href} data-testid={t.testId} className="group block h-full">
                <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-lg">
                  <CardContent className="flex h-full flex-col gap-3 p-6">
                    <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon name={t.icon} size={22} />
                    </span>
                    <h2 className="font-display text-lg font-semibold">{t.title}</h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">{t.desc}</p>
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-primary">
                      Open tool <Icon name="arrowRight" size={15} />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── API CTA ── */}
      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <Reveal>
          <Card className="overflow-hidden">
            <CardContent className="flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold">Need these answers inside your own product?</h2>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  Everything on this page is one API call: rates, serviceability, volumetric math and the
                  full pincode master. Free plan includes 1,000 calls a month.
                </p>
              </div>
              <div className="flex shrink-0 gap-3">
                <Button variant="gradient" asChild data-testid="tools-cta-signup-btn">
                  <Link href="/signup">Get an API key</Link>
                </Button>
                <Button variant="outline" asChild data-testid="tools-cta-docs-btn">
                  <Link href="/docs">Read the docs</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </Reveal>
      </section>
    </>
  );
}
