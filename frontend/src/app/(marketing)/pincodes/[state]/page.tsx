import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";
import { fetchStateDetail } from "@/lib/pincode-directory";
import { formatNumber } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/icons";

export const revalidate = 21600;

type Props = { params: Promise<{ state: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state } = await params;
  const detail = await fetchStateDetail(state);
  if (!detail) return pageMetadata({ title: "Pincodes", description: "Pincode directory", path: `/pincodes/${state}`, noIndex: true });
  return pageMetadata({
    title: `${detail.state} Pincodes — ${formatNumber(detail.count)} Serviceable PIN Codes by District`,
    description: `Complete list of serviceable pincodes in ${detail.state}: ${formatNumber(detail.count)} delivery PIN codes across ${detail.districts.length} districts, with metro and remote-area classification. Synced nightly with India Post.`,
    path: `/pincodes/${state}`,
    keywords: [
      `${detail.state.toLowerCase()} pincode list`,
      `pincodes in ${detail.state.toLowerCase()}`,
      `${detail.state.toLowerCase()} pin code directory`,
    ],
  });
}

function breadcrumbJsonLd(stateName: string, stateSlug: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Pincode directory", item: `${site.url}/pincodes` },
      { "@type": "ListItem", position: 2, name: stateName, item: `${site.url}/pincodes/${stateSlug}` },
    ],
  };
}

export default async function StatePincodesPage({ params }: Props) {
  const { state } = await params;
  const detail = await fetchStateDetail(state);
  if (!detail) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(detail.state, detail.slug)) }}
      />

      <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 lg:pt-16">
        <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb" data-testid="pincodes-state-breadcrumb">
          <Link href="/pincodes" className="hover:text-foreground">Pincode directory</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{detail.state}</span>
        </nav>

        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Pincodes in {detail.state}
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          {formatNumber(detail.count)} serviceable delivery pincodes across {detail.districts.length}{" "}
          districts{detail.metros > 0 ? `, including ${formatNumber(detail.metros)} metro-lane pincodes` : ""}.
          Pick a district to see every PIN code with its serviceability details.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="pincodes-districts-grid">
          {detail.districts.map((d) => (
            <Link
              key={d.slug}
              href={`/pincodes/${detail.slug}/${d.slug}`}
              data-testid={`pincodes-district-card-${d.slug}`}
              className="group block"
            >
              <Card className="transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <h2 className="font-medium">{d.district}</h2>
                    <p className="text-xs text-muted-foreground tabular-nums">{formatNumber(d.count)} pincodes</p>
                  </div>
                  <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16 text-center text-sm text-muted-foreground sm:px-6">
        <p>
          Shipping to {detail.state}? Get exact door-to-door charges with the{" "}
          <Link href="/tools/shipping-rate-calculator" className="font-medium text-primary hover:underline">
            shipping rate calculator
          </Link>
          .
        </p>
      </section>
    </>
  );
}
