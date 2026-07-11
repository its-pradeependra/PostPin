import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { fetchStates } from "@/lib/pincode-directory";
import { formatNumber } from "@/lib/format";
import { Reveal } from "@/components/marketing/reveal";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/icons";

export const revalidate = 21600;

export const metadata: Metadata = pageMetadata({
  title: "India Pincode Directory — Serviceable PIN Codes by State",
  description:
    "Browse every serviceable Indian pincode, organised state by state — 19,000+ delivery PIN codes with city, district, metro and remote-area classification, synced nightly with India Post.",
  path: "/pincodes",
  keywords: [
    "india pincode directory",
    "pincode list by state",
    "all india pin codes",
    "serviceable pincodes",
    "pin code directory india post",
  ],
});

export default async function PincodesIndexPage() {
  const states = await fetchStates();

  return (
    <>
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
        <div className="pointer-events-none absolute -top-28 left-1/2 -z-10 size-[40rem] -translate-x-1/2 rounded-full bg-brand-gradient opacity-[0.14] blur-[130px]" />
        <div className="mx-auto max-w-3xl px-4 pb-4 pt-16 text-center sm:px-6 lg:pt-20">
          <Reveal blur>
            <h1 className="text-balance font-display text-[2.5rem] font-bold leading-[1.08] tracking-tight sm:text-5xl">
              India pincode directory
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg text-muted-foreground">
              Every serviceable delivery pincode in the country, organised by state and district — kept in
              nightly sync with the official India Post directory.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── States grid ── */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {!states || states.length === 0 ? (
          <p className="text-center text-muted-foreground">
            The directory is being refreshed — please check back in a moment.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="pincodes-states-grid">
            {states.map((s, i) => (
              <Reveal key={s.slug} as="div" index={i % 9}>
                <Link href={`/pincodes/${s.slug}`} data-testid={`pincodes-state-card-${s.slug}`} className="group block h-full">
                  <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
                    <CardContent className="flex items-center justify-between gap-3 p-5">
                      <div>
                        <h2 className="font-display font-semibold">{s.state}</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
                          {formatNumber(s.count)} pincodes
                          {s.metros > 0 ? ` · ${formatNumber(s.metros)} metro` : ""}
                        </p>
                      </div>
                      <Icon name="chevronRight" size={18} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </CardContent>
                  </Card>
                </Link>
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {/* ── Cross-links ── */}
      <section className="mx-auto max-w-3xl px-4 pb-20 text-center text-sm text-muted-foreground sm:px-6">
        <p>
          Looking for one pincode? Use the{" "}
          <Link href="/tools/pincode-lookup" className="font-medium text-primary hover:underline">
            pincode lookup tool
          </Link>{" "}
          — or calculate live courier charges with the{" "}
          <Link href="/tools/shipping-rate-calculator" className="font-medium text-primary hover:underline">
            shipping rate calculator
          </Link>
          .
        </p>
      </section>
    </>
  );
}
