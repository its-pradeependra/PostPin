import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Icon, type IconName } from "@/components/icons";
import { CodeTabs } from "@/components/shared/code-block";
import { RateCalculator } from "@/components/shipping/rate-calculator";
import { SyncSnapshotCard, ZonesTable, RateCardIllustration } from "./features-live";
import { site } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Features — Shipping Rate Engine, Pincode Sync, Zones & Rate Cards",
  description:
    "India Post pincode auto-sync, a deterministic shipping engine, configurable zones, per-customer rate cards, API key security, analytics and webhooks — everything Postpin gives you to price a parcel.",
  path: "/features",
  keywords: [
    "shipping rate engine",
    "pincode auto sync",
    "shipping zones India",
    "courier rate card API",
    "serviceability check API",
  ],
});

// ── Anchor navigation ────────────────────────────────────────────────
const ANCHORS: { id: string; label: string; icon: IconName }[] = [
  { id: "sync", label: "Pincode sync", icon: "sync" },
  { id: "engine", label: "Shipping engine", icon: "calculator" },
  { id: "zones", label: "Zones", icon: "zones" },
  { id: "rate-cards", label: "Rate cards", icon: "rateCard" },
  { id: "security", label: "API keys & security", icon: "shield" },
  { id: "analytics", label: "Analytics", icon: "analytics" },
  { id: "webhooks", label: "Webhooks", icon: "webhook" },
];

// ── Rate request / response sample (for the engine CodeTabs) ─────────
const RATE_CODE_TABS = [
  {
    label: "Request",
    language: "bash",
    code: `curl ${site.apiBase}/rates/calculate \\
  -H "Authorization: Bearer pk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "origin": "302001",
    "destination": "781001",
    "weight": 400,
    "dimensions": { "length": 30, "width": 25, "height": 8, "unit": "cm" },
    "service": "surface",
    "cod": true,
    "declared_value": 1499
  }'`,
  },
  {
    label: "Response",
    language: "json",
    code: `{
  "currency": "INR",
  "zone": "special",
  "zone_label": "Special / Remote",
  "chargeable_weight": 1200,
  "volumetric_weight": 1200,
  "eta_days": [5, 9],
  "breakdown": [
    { "label": "Base charge",     "amount": 95.00, "hint": "Special / Remote · Surface" },
    { "label": "Weight charge",   "amount": 108.00, "hint": "1.50 kg chargeable" },
    { "label": "Fuel surcharge",  "amount": 24.36, "hint": "12%" },
    { "label": "COD handling",    "amount": 57.49, "hint": "₹35 + 1.5%" },
    { "label": "GST",             "amount": 51.27, "hint": "18%" }
  ],
  "total": 336.12,
  "meta": { "cached": false, "engine_ms": 11, "request_id": "req_f1e2d3" }
}`,
  },
  {
    label: "Node",
    language: "javascript",
    code: `import { Postpin } from "@postpin/node";

const postpin = new Postpin("pk_live_...");

const rate = await postpin.rates.calculate({
  origin: "302001",        // Jaipur
  destination: "781001",   // Guwahati (special zone)
  weight: 400,
  dimensions: { length: 30, width: 25, height: 8 },
  service: "surface",
  cod: true,
  declaredValue: 1499,
});

console.log(rate.zoneLabel); // "Special / Remote"
console.log(rate.total);     // 336.12`,
  },
];

// ── Comparison: Postpin vs DIY / courier sheets ──────────────────────
const COMPARISON: { feature: string; postpin: string | true; diy: string | false }[] = [
  { feature: "India Post pincode coverage", postpin: "Full master, managed imports", diy: "Manual CSVs, often stale" },
  { feature: "Billable (volumetric) weight", postpin: true, diy: "Hand-coded per courier" },
  { feature: "Deterministic zone resolution", postpin: "5 zones, effective-dated", diy: "Spreadsheet lookups" },
  { feature: "COD + fuel + GST pipeline", postpin: "Itemised in every response", diy: "Re-implemented per integration" },
  { feature: "Per-customer rate cards", postpin: "Draft → simulate → publish", diy: false },
  { feature: "API key domain / IP / referer control", postpin: true, diy: false },
  { feature: "Usage analytics & latency percentiles", postpin: true, diy: "DIY logging" },
  { feature: "Signed webhooks with replay", postpin: true, diy: false },
  { feature: "Rate response latency (p99)", postpin: "<50 ms, Redis-cached", diy: "Varies — courier API limited" },
  { feature: "Ongoing maintenance", postpin: "Managed for you", diy: "Your engineers, forever" },
];

const SECURITY_CHIPS = [
  { label: "checkout.flipmart.in", icon: "globe" as IconName },
  { label: "*.flipmart.in", icon: "globe" as IconName },
  { label: "52.66.0.0/16", icon: "shield" as IconName },
  { label: "referer: flipmart.in", icon: "link" as IconName },
];

export default function FeaturesPage() {
  return (
    <div data-testid="features-page">
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-50" />
        <div className="pointer-events-none absolute -top-40 right-1/3 -z-10 size-[36rem] rounded-full bg-brand-gradient opacity-20 blur-[130px]" />
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 lg:py-24">
          <Badge variant="outline" className="gap-1.5 border-primary/30 bg-primary/5 py-1 text-primary">
            <Icon name="sparkles" trigger="loop" animation="pulse" size={13} />
            The platform behind every quote
          </Badge>
          <h1 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Everything you need to <span className="text-gradient">price a parcel</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            From India Post pincode sync to a deterministic charge engine, configurable zones,
            negotiated rate cards, hardened API keys, analytics and webhooks — Postpin is a full
            shipping-pricing platform, not just a calculator.
          </p>

          {/* Anchor chips */}
          <nav
            data-testid="features-anchor-chips"
            aria-label="Jump to feature"
            className="mx-auto mt-8 flex max-w-3xl snap-x flex-nowrap gap-2 overflow-x-auto pb-2 sm:flex-wrap sm:justify-center sm:overflow-visible"
          >
            {ANCHORS.map((a) => (
              <Link
                key={a.id}
                href={`#${a.id}`}
                data-testid={`features-anchor-${a.id}`}
                className="group inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
              >
                <Icon name={a.icon} trigger="group-hover" size={15} />
                {a.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* ── Live calculator strip ── */}
      <section className="border-y border-border bg-card/40">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionEyebrow icon="zap">See it compute</SectionEyebrow>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              One request. A fully itemised INR charge.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Try a real quote — Jaipur to Guwahati crosses into a special/remote zone, so you can
              watch billable weight, zone, fuel, COD and GST resolve live. The same engine powers the
              API and your dashboard.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Volumetric vs actual weight, automatically billed",
                "Deterministic zone & ETA resolution",
                "COD, fuel and GST itemised in every response",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Icon name="checkCircle" size={18} className="mt-0.5 shrink-0 text-success" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div data-testid="features-calc">
            <RateCalculator compact />
          </div>
        </div>
      </section>

      {/* ── 1 · Pincode auto-sync ── */}
      <FeatureBlock
        id="sync"
        eyebrow="Pincode auto-sync"
        eyebrowIcon="sync"
        title="Your pincode master, always current with India Post"
        body="Postpin diffs the India Post directory into your database via managed imports — inserting new pincodes, updating changed ones and retiring removed entries. Full sync logs, failure alerts, CSV import/export and one-click rollback mean you never ship a stale serviceability table again."
        bullets={[
          "Pincode master updated via managed imports",
          "CSV import & export for offline overrides and audits",
          "One-click rollback to any previous successful sync",
        ]}
        testId="sync"
      >
        <SyncSnapshotCard />
      </FeatureBlock>

      {/* ── 2 · Shipping engine ── */}
      <FeatureBlock
        id="engine"
        eyebrow="Shipping engine"
        eyebrowIcon="calculator"
        title="A deterministic engine: billable weight, zones, COD, fuel & GST"
        body="Send pickup + delivery pincode, weight, dimensions and payment type. Postpin computes volumetric weight (L×W×H ÷ 5000), bills the greater of actual and volumetric, resolves the zone and runs the full COD → fuel → GST pipeline — returning an itemised JSON response in under 50ms."
        bullets={[
          "Billable weight = max(actual, volumetric), rounded to slabs",
          "Surface, Express and Same-day service multipliers",
          "Every line itemised: base, weight, fuel, COD, GST",
        ]}
        flip
        testId="engine"
      >
        <CodeTabs tabs={RATE_CODE_TABS} testId="features-engine-code" />
      </FeatureBlock>

      {/* ── 3 · Zone management ── */}
      <FeatureBlock
        id="zones"
        eyebrow="Zone management"
        eyebrowIcon="zones"
        title="Map all of India into the zones your pricing needs"
        body="Postpin ships with five sensible zones keyed to real pincode prefixes — and you can remap states, districts or pincode ranges into your own. Resolution is deterministic and effective-dated, so a quote is always reproducible from its timestamp."
        bullets={[
          "Local, Regional, Metro, National and Special / Remote out of the box",
          "Effective-dated rules for reproducible quotes",
          "Per-zone ETA windows surfaced in every response",
        ]}
        testId="zones"
      >
        <ZonesTable />
      </FeatureBlock>

      {/* ── 4 · Per-customer rate cards ── */}
      <FeatureBlock
        id="rate-cards"
        eyebrow="Per-customer rate cards"
        eyebrowIcon="rateCard"
        title="Negotiated pricing per customer — without touching code"
        body="Build weight-slab rate cards per zone, override COD/fuel/GST, and assign them to specific companies. Draft a card, simulate it against real requests, then publish — Postpin applies the right card automatically based on the calling key's tenant."
        bullets={[
          "Weight slabs per zone with an 'extra per 500g' tail",
          "Per-card COD flat + %, fuel % and GST overrides",
          "Draft → simulate → publish lifecycle, fully audited",
        ]}
        flip
        testId="rate-cards"
      >
        <RateCardIllustration />
      </FeatureBlock>

      {/* ── 5 · API keys & security ── */}
      <FeatureBlock
        id="security"
        eyebrow="API keys & security"
        eyebrowIcon="shield"
        title="Keys you can lock down to a domain, IP or referer"
        body="Issue live and test keys, then restrict each one to allowed domains (wildcards supported), IP ranges (CIDR) and referer/origin checks. Rotate or revoke instantly — a leaked key is useless outside your allow-list."
        bullets={[
          "Domain allow-list with wildcard support (*.yourdomain.in)",
          "IP / CIDR allow-list and referer / origin enforcement",
          "Instant rotate & revoke, with full key audit trail",
        ]}
        testId="security"
      >
        <Card className="group p-6" data-testid="features-key-card">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon name="keys" trigger="group-hover" size={16} className="text-primary" />
              Production key
            </span>
            <Badge variant="success">Active</Badge>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-sm">
            <span className="truncate text-muted-foreground">pk_live_3kQ9••••••••••••••••f7Az</span>
            <Icon name="lock" size={15} className="shrink-0 text-success" />
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Restrictions
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SECURITY_CHIPS.map((chip) => (
              <span
                key={chip.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-accent px-2.5 py-1 font-mono text-xs"
              >
                <Icon name={chip.icon} size={13} className="text-primary" />
                {chip.label}
              </span>
            ))}
          </div>
        </Card>
      </FeatureBlock>

      {/* ── 6 · Analytics ── */}
      <FeatureBlock
        id="analytics"
        eyebrow="Usage analytics"
        eyebrowIcon="analytics"
        title="See every call, latency percentile and blocked request"
        body="Your dashboard charts calls over time, success vs blocked, top endpoints, latency percentiles and peak hours. Spot a misbehaving integration, prove your SLA, and forecast overages before the bill lands."
        bullets={[
          "Calls over time with success / blocked breakdown",
          "p50 / p95 / p99 latency and peak-hour heat",
          "Top endpoints and per-key usage attribution",
        ]}
        flip
        testId="analytics"
      >
        <Card className="p-6" data-testid="features-analytics-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Calls · last 30 days</span>
            <Badge variant="info" className="gap-1">
              <Icon name="gauge" size={12} /> p95 41 ms
            </Badge>
          </div>
          {/* Lightweight static bar preview (real charts live in-dashboard) */}
          <div className="mt-5 flex h-32 items-end gap-1.5" aria-hidden>
            {[38, 52, 47, 64, 58, 72, 69, 81, 76, 88, 92, 84].map((h, i) => (
              <span
                key={i}
                className="flex-1 rounded-t bg-brand-gradient"
                style={{ height: `${h}%`, opacity: 0.55 + (i / 12) * 0.45 }}
              />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              { k: "Calls", v: "1.2M" },
              { k: "Success", v: "99.4%" },
              { k: "Blocked", v: "0.6%" },
            ].map((s) => (
              <div key={s.k} className="rounded-lg bg-accent p-2">
                <p className="font-display text-lg font-bold tabular-nums">{s.v}</p>
                <p className="text-xs text-muted-foreground">{s.k}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">Example data</p>
        </Card>
      </FeatureBlock>

      {/* ── 7 · Webhooks ── */}
      <FeatureBlock
        id="webhooks"
        eyebrow="Webhooks & events"
        eyebrowIcon="webhook"
        title="Signed events for rates, keys, billing and sync"
        body="Subscribe to platform events with HMAC-signed payloads, inspect every delivery attempt, and replay failures from the dashboard. Build internal alerts, reconcile billing, or trigger workflows the moment a sync completes."
        bullets={[
          "HMAC-signed payloads you can verify in your handler",
          "Per-delivery logs with status, latency and response body",
          "One-click replay for any failed or pending delivery",
        ]}
        testId="webhooks"
      >
        <Card className="group p-6" data-testid="features-webhook-card">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon name="webhook" trigger="group-hover" size={16} className="text-primary" />
              flipmart.in/api/postpin/webhook
            </span>
            <Badge variant="success">Healthy</Badge>
          </div>
          <ul className="mt-4 space-y-2">
            {[
              { ev: "sync.completed", code: "200", ok: true },
              { ev: "rate.calculated", code: "200", ok: true },
              { ev: "key.rotated", code: "200", ok: true },
              { ev: "billing.overage", code: "504", ok: false },
            ].map((d) => (
              <li
                key={d.ev}
                data-testid={`features-webhook-delivery-${d.ev}`}
                className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2 font-mono text-xs">
                  <Icon
                    name={d.ok ? "checkCircle" : "activity"}
                    size={14}
                    className={d.ok ? "text-success" : "text-destructive"}
                  />
                  {d.ev}
                </span>
                <span
                  className={`font-mono text-xs tabular-nums ${
                    d.ok ? "text-success" : "text-destructive"
                  }`}
                >
                  {d.code}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </FeatureBlock>

      {/* ── Comparison table ── */}
      <section className="border-y border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <SectionEyebrow icon="trending" center>
              Why Postpin
            </SectionEyebrow>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Postpin vs DIY & courier rate sheets
            </h2>
            <p className="mt-3 text-muted-foreground">
              Stop maintaining stale spreadsheets and re-implementing the same charge logic in every
              service. One API replaces the lot.
            </p>
          </div>

          <Card className="mt-12 overflow-hidden p-0" data-testid="features-comparison-table">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">Capability</TableHead>
                    <TableHead className="text-center">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                        <Icon name="rocket" size={15} /> Postpin
                      </span>
                    </TableHead>
                    <TableHead className="text-center text-muted-foreground">
                      DIY / courier sheets
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {COMPARISON.map((row) => (
                    <TableRow
                      key={row.feature}
                      data-testid={`features-comparison-row-${row.feature
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/(^-|-$)/g, "")}`}
                    >
                      <TableCell className="font-medium">{row.feature}</TableCell>
                      <TableCell className="text-center">
                        {row.postpin === true ? (
                          <span className="inline-flex items-center justify-center text-success">
                            <Icon name="checkCircle" size={18} />
                            <span className="sr-only">Included</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center gap-1.5 text-sm font-medium">
                            <Icon name="check" size={15} className="shrink-0 text-success" />
                            {row.postpin}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {row.diy === false ? (
                          <span className="inline-flex items-center justify-center text-muted-foreground/60">
                            <Icon name="trash" size={16} />
                            <span className="sr-only">Not available</span>
                          </span>
                        ) : (
                          row.diy
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Card className="relative overflow-hidden border-primary/20 p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute inset-0 bg-brand-gradient opacity-[0.06]" />
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
          <div className="relative">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Ship accurate Indian shipping rates today.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              Every feature on this page is live on the free plan — 1,000 rate calls a month, no
              credit card.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/signup" data-testid="features-cta-signup-btn">
                  Start free
                  <Icon name="arrowRight" trigger="group-hover" size={17} className="text-white" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/docs" data-testid="features-cta-docs-btn">
                  <Icon name="code" trigger="group-hover" size={17} />
                  Read the docs
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}

// ── Reusable alternating feature block ───────────────────────────────
function FeatureBlock({
  id,
  eyebrow,
  eyebrowIcon,
  title,
  body,
  bullets,
  children,
  flip = false,
  testId,
}: {
  id: string;
  eyebrow: string;
  eyebrowIcon: IconName;
  title: string;
  body: string;
  bullets: string[];
  children: React.ReactNode;
  flip?: boolean;
  testId: string;
}) {
  return (
    <section
      id={id}
      data-testid={`features-block-${testId}`}
      className="scroll-mt-24 border-b border-border"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div className={flip ? "lg:order-2" : undefined}>
          <SectionEyebrow icon={eyebrowIcon}>{eyebrow}</SectionEyebrow>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
          <p className="mt-3 text-muted-foreground">{body}</p>
          <ul className="mt-6 space-y-3">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm">
                <Icon name="checkCircle" size={18} className="mt-0.5 shrink-0 text-success" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={flip ? "lg:order-1" : undefined}>{children}</div>
      </div>
    </section>
  );
}

function SectionEyebrow({
  icon,
  children,
  center = false,
}: {
  icon: IconName;
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <p
      className={`inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary ${
        center ? "justify-center" : ""
      }`}
    >
      <Icon name={icon} size={14} />
      {children}
    </p>
  );
}
