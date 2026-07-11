import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";
import { fetchPincodeDetail } from "@/lib/pincode-directory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/icons";

export const revalidate = 21600;

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const p = await fetchPincodeDetail(code);
  if (!p) return pageMetadata({ title: "Pincode", description: "Pincode detail", path: `/pincode/${code}`, noIndex: true });
  const place = [p.city, p.district, p.state].filter(Boolean).join(", ");
  return pageMetadata({
    title: `${p.pincode} Pincode — ${place} | Serviceability & Shipping`,
    description: `Pincode ${p.pincode} (${place}): ${p.is_metro ? "metro lane" : p.is_remote ? "remote area" : "standard lane"}, prepaid ${p.serviceable.prepaid ? "serviceable" : "not serviceable"}, COD ${p.serviceable.cod ? "available" : "unavailable"}. Check delivery serviceability and calculate exact shipping charges to ${p.pincode}.`,
    path: `/pincode/${code}`,
    keywords: [
      `${p.pincode} pincode`,
      `pincode ${p.pincode}`,
      `${p.pincode} which city`,
      `${p.pincode} courier delivery`,
    ],
  });
}

export default async function PincodeDetailPage({ params }: Props) {
  const { code } = await params;
  const p = await fetchPincodeDetail(code);
  if (!p) notFound();

  const place = [p.city, p.district, p.state].filter(Boolean).join(", ");
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Pincode directory", item: `${site.url}/pincodes` },
          ...(p.state && p.state_slug
            ? [{ "@type": "ListItem", position: 2, name: p.state, item: `${site.url}/pincodes/${p.state_slug}` }]
            : []),
          ...(p.district && p.state_slug && p.district_slug
            ? [{ "@type": "ListItem", position: 3, name: p.district, item: `${site.url}/pincodes/${p.state_slug}/${p.district_slug}` }]
            : []),
          { "@type": "ListItem", position: 4, name: p.pincode, item: `${site.url}/pincode/${p.pincode}` },
        ],
      },
      {
        "@type": "Place",
        name: `${p.pincode} — ${place}`,
        address: {
          "@type": "PostalAddress",
          postalCode: p.pincode,
          addressLocality: p.city ?? undefined,
          addressRegion: p.state ?? undefined,
          addressCountry: "IN",
        },
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="mx-auto max-w-4xl px-4 pt-12 sm:px-6 lg:pt-16">
        <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb" data-testid="pincode-detail-breadcrumb">
          <Link href="/pincodes" className="hover:text-foreground">Pincode directory</Link>
          {p.state && p.state_slug && (
            <>
              <span className="mx-2">/</span>
              <Link href={`/pincodes/${p.state_slug}`} className="hover:text-foreground">{p.state}</Link>
            </>
          )}
          {p.district && p.state_slug && p.district_slug && (
            <>
              <span className="mx-2">/</span>
              <Link href={`/pincodes/${p.state_slug}/${p.district_slug}`} className="hover:text-foreground">{p.district}</Link>
            </>
          )}
          <span className="mx-2">/</span>
          <span className="text-foreground">{p.pincode}</span>
        </nav>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">{p.pincode}</h1>
          {p.is_metro && <Badge variant="info">Metro lane</Badge>}
          {p.is_remote && <Badge variant="warning">Remote area</Badge>}
          {!p.is_metro && !p.is_remote && <Badge variant="muted">Standard lane</Badge>}
        </div>
        <p className="mt-2 text-lg text-muted-foreground">{place}</p>
      </section>

      <section className="mx-auto grid max-w-4xl gap-5 px-4 py-10 sm:px-6 md:grid-cols-2">
        {/* Facts */}
        <Card data-testid="pincode-detail-facts-card">
          <CardContent className="space-y-3 p-6">
            <h2 className="font-display font-semibold">Pincode details</h2>
            <dl className="space-y-2.5 text-sm">
              {p.office_name && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Post office</dt>
                  <dd className="text-right font-medium">{p.office_name}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Area / city</dt>
                <dd className="text-right font-medium">{p.city ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">District</dt>
                <dd className="text-right font-medium">{p.district ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">State</dt>
                <dd className="text-right font-medium">{p.state ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Lane classification</dt>
                <dd className="text-right font-medium">
                  {p.is_metro ? "Metro" : p.is_remote ? "Remote area (surcharge may apply)" : "Standard"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Serviceability */}
        <Card data-testid="pincode-detail-serviceability-card">
          <CardContent className="space-y-4 p-6">
            <h2 className="font-display font-semibold">Delivery serviceability</h2>
            <div className="space-y-2.5 text-sm">
              {(
                [
                  ["Prepaid delivery", p.serviceable.prepaid],
                  ["Cash on Delivery (COD)", p.serviceable.cod],
                  ["Pickup available", p.serviceable.pickup],
                ] as const
              ).map(([label, ok]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">{label}</span>
                  <Badge variant={ok ? "success" : "destructive"}>{ok ? "Available" : "Not available"}</Badge>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="gradient" asChild data-testid="pincode-detail-rate-btn">
                <Link href="/tools/shipping-rate-calculator">
                  <Icon name="calculator" size={16} /> Calculate shipping to {p.pincode}
                </Link>
              </Button>
              <Button variant="outline" asChild data-testid="pincode-detail-api-btn">
                <Link href="/docs">Get this data via API</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Nearby pincodes */}
      {p.nearby.length > 0 && (
        <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
          <h2 className="font-display text-xl font-semibold">
            Nearby pincodes{p.district ? ` in ${p.district}` : ""}
          </h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-testid="pincode-detail-nearby">
            {p.nearby.map((n) => (
              <Link
                key={n.pincode}
                href={`/pincode/${n.pincode}`}
                data-testid={`pincode-nearby-${n.pincode}`}
                className="rounded-lg border border-border bg-card px-4 py-2.5 transition-colors hover:border-primary/40 hover:bg-accent"
              >
                <span className="font-mono font-semibold tabular-nums">{n.pincode}</span>
                {n.city && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.city}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
