import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";
import { fetchDistrictDetail } from "@/lib/pincode-directory";
import { formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const revalidate = 21600;

type Props = { params: Promise<{ state: string; district: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state, district } = await params;
  const d = await fetchDistrictDetail(state, district);
  if (!d) {
    return pageMetadata({ title: "Pincodes", description: "Pincode directory", path: `/pincodes/${state}/${district}`, noIndex: true });
  }
  return pageMetadata({
    title: `${d.district} Pincodes (${d.state}) — All ${formatNumber(d.count)} PIN Codes`,
    description: `All ${formatNumber(d.count)} serviceable pincodes in ${d.district}, ${d.state} with area names, metro and remote-area status. Check serviceability and calculate shipping charges to any of them.`,
    path: `/pincodes/${state}/${district}`,
    keywords: [
      `${d.district.toLowerCase()} pincode`,
      `${d.district.toLowerCase()} pin code list`,
      `pincodes in ${d.district.toLowerCase()}`,
    ],
  });
}

function breadcrumbJsonLd(d: { state: string; state_slug: string; district: string; district_slug: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Pincode directory", item: `${site.url}/pincodes` },
      { "@type": "ListItem", position: 2, name: d.state, item: `${site.url}/pincodes/${d.state_slug}` },
      { "@type": "ListItem", position: 3, name: d.district, item: `${site.url}/pincodes/${d.state_slug}/${d.district_slug}` },
    ],
  };
}

export default async function DistrictPincodesPage({ params }: Props) {
  const { state, district } = await params;
  const d = await fetchDistrictDetail(state, district);
  if (!d) notFound();

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(d)) }} />

      <section className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 lg:pt-16">
        <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb" data-testid="pincodes-district-breadcrumb">
          <Link href="/pincodes" className="hover:text-foreground">Pincode directory</Link>
          <span className="mx-2">/</span>
          <Link href={`/pincodes/${d.state_slug}`} className="hover:text-foreground">{d.state}</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{d.district}</span>
        </nav>

        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {d.district} pincodes
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          {formatNumber(d.count)} serviceable delivery pincodes in {d.district}, {d.state}. Every code links
          to a detail page with live serviceability.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="pincodes-district-list">
          {d.pincodes.map((p) => (
            <Link
              key={p.pincode}
              href={`/pincode/${p.pincode}`}
              data-testid={`pincode-link-${p.pincode}`}
              className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2.5 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <span className="flex min-w-0 items-baseline gap-3">
                <span className="font-mono font-semibold tabular-nums">{p.pincode}</span>
                {p.area && <span className="truncate text-sm text-muted-foreground">{p.area}</span>}
              </span>
              <span className="flex shrink-0 gap-1">
                {p.is_metro && <Badge variant="info" className="px-1.5 py-0 text-[10px]">Metro</Badge>}
                {p.is_remote && <Badge variant="warning" className="px-1.5 py-0 text-[10px]">Remote</Badge>}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16 text-center text-sm text-muted-foreground sm:px-6">
        <p>
          Shipping to {d.district}? Get exact charges with the{" "}
          <Link href="/tools/shipping-rate-calculator" className="font-medium text-primary hover:underline">
            shipping rate calculator
          </Link>
          , or check any code with the{" "}
          <Link href="/tools/pincode-lookup" className="font-medium text-primary hover:underline">
            pincode lookup
          </Link>
          .
        </p>
      </section>
    </>
  );
}
