import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/icons";
import { CodeTabs } from "@/components/shared/code-block";
import { RateCalculator } from "@/components/shipping/rate-calculator";
import { HeroApiMoment } from "@/components/marketing/hero-api-moment";
import { Reveal } from "@/components/marketing/reveal";
import { LandingPlans } from "./landing-plans";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: `${site.name}: ${site.tagline}`,
  description: site.description,
};

/** Live platform stats, fetched server-side each hour. Falls back to honest
 * floor values if the API is unreachable at render time. */
async function fetchLandingStats(): Promise<{ pincodes: number | null; zones: number | null }> {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";
    const res = await fetch(`${base}/public/stats`, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { data?: { pincodes?: number; zones?: unknown[] } };
    return { pincodes: j.data?.pincodes ?? null, zones: j.data?.zones?.length ?? null };
  } catch {
    return { pincodes: null, zones: null };
  }
}

const formatIN = (n: number) => n.toLocaleString("en-IN");

function buildStats(live: { pincodes: number | null; zones: number | null }) {
  return [
    { value: live.pincodes ? formatIN(live.pincodes) : "19,000+", label: "Pincodes synced from India Post" },
    { value: "<50ms", label: "p99 rate response" },
    { value: "99.9%", label: "Uptime SLA" },
    { value: String(live.zones ?? 5), label: "Shipping zones, fully configurable" },
  ];
}

const STEPS = [
  { icon: "keys" as IconName, title: "Get your API key", body: "Sign up and generate a domain-restricted key in seconds. Live and test environments included." },
  { icon: "code" as IconName, title: "Call /v1/rates", body: "Send pickup + delivery pincode, weight, dimensions and payment type. One request, one JSON response." },
  { icon: "truck" as IconName, title: "Show the rate", body: "Render an accurate, GST-aware shipping charge at checkout, with zone, ETA and breakdown included." },
];

const FEATURES = [
  { icon: "sync" as IconName, title: "India Post auto-sync", body: "A nightly sync pulls the official data.gov.in India Post directory: new and updated pincodes land automatically, with a full, audited log of every run." },
  { icon: "zones" as IconName, title: "Configurable zone engine", body: "Map states, districts and pincode ranges into unlimited zones. Deterministic origin × destination resolution, effective-dated for reproducible quotes." },
  { icon: "rateCard" as IconName, title: "Per-customer rate cards", body: "Build weight-slab rate cards per zone and assign negotiated pricing per company. Draft, simulate, then publish." },
  { icon: "shield" as IconName, title: "Keys, domains & IP control", body: "Restrict keys to domains (incl. wildcards), IP allowlists and referer/origin checks. Rotate and revoke instantly." },
  { icon: "analytics" as IconName, title: "Usage analytics", body: "Calls over time, success vs blocked, top endpoints, latency percentiles and peak hours, all in your dashboard." },
  { icon: "webhook" as IconName, title: "Webhooks & events", body: "Subscribe to rate, key, billing and sync events with signed payloads, delivery logs and replay." },
];

const CODE_TABS = [
  {
    label: "cURL",
    language: "bash",
    code: `curl https://api.postpin.dev/v1/rates/calculate \\
  -H "Authorization: Bearer pk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "origin": "400001",
    "destination": "110001",
    "weight": 1200,
    "service": "express",
    "cod": false
  }'`,
  },
  {
    label: "JavaScript",
    language: "javascript",
    code: `import { Postpin } from "@postpin/node";

const postpin = new Postpin("pk_live_...");

const rate = await postpin.rates.calculate({
  origin: "400001",
  destination: "110001",
  weight: 1200,
  service: "express",
  cod: false,
});

console.log(rate.total); // 254.38`,
  },
  {
    label: "Python",
    language: "python",
    code: `from postpin import Postpin

postpin = Postpin("pk_live_...")

rate = postpin.rates.calculate(
    origin="400001",
    destination="110001",
    weight=1200,
    service="express",
    cod=False,
)

print(rate.total)  # 254.38`,
  },
  {
    label: "Response",
    language: "json",
    code: `{
  "total": 254.38,
  "currency": "INR",
  "zone": "metro",
  "eta_days": [1, 3],
  "chargeable_weight": 1200,
  "breakdown": [
    { "label": "Base charge", "amount": 88.00 },
    { "label": "Weight charge", "amount": 121.60 },
    { "label": "Fuel surcharge", "amount": 25.15 },
    { "label": "GST", "amount": 38.79 }
  ],
  "meta": { "cached": true, "request_id": "req_f1e2d3" }
}`,
  },
];

const LOGOS = [
  { name: "FlipMart", mark: "FM" },
  { name: "BharatBox", mark: "BB" },
  { name: "Velocity", mark: "Vc" },
  { name: "Kirana Connect", mark: "KC" },
  { name: "Sadak ERP", mark: "SE" },
  { name: "MumbaiMeds", mark: "MM" },
];

const TESTIMONIALS = [
  { quote: "Postpin replaced three courier rate sheets with one API call. Checkout shipping estimates went from minutes to milliseconds.", name: "Aarav Sharma", role: "Head of Engineering, FlipMart" },
  { quote: "The India Post sync alone saved us a monthly data ops nightmare. Pincodes are just always current now.", name: "Deepa Menon", role: "CTO, Velocity Couriers" },
  { quote: "Per-customer rate cards let us onboard B2B clients with negotiated pricing without touching code.", name: "Karan Patel", role: "Founder, Gully Grocery" },
];

export default async function LandingPage() {
  const live = await fetchLandingStats();
  const STATS = buildStats(live);
  return (
    <>
      {/* ── Hero: "Wire Tap" API moment ── */}
      <HeroApiMoment />

      {/* Logo cloud */}
      <div className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <p className="text-center text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Trusted by India's fastest-moving commerce & logistics teams
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-9 gap-y-5">
          {LOGOS.map((b, i) => (
            <Reveal
              key={b.name}
              as="div"
              index={i}
              stagger={0.05}
              className="group flex items-center gap-2 text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
                <rect x="1.25" y="1.25" width="29.5" height="29.5" rx="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <text x="16" y="21.5" textAnchor="middle" fontSize="12.5" fontWeight="700" className="fill-current font-display">
                  {b.mark}
                </text>
              </svg>
              <span className="font-display text-[15px] font-semibold tracking-tight">{b.name}</span>
            </Reveal>
          ))}
        </div>
      </div>

      {/* ── Stats band ── */}
      <section className="border-y border-border bg-card/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-12 sm:px-6 lg:grid-cols-4 lg:divide-x lg:divide-border">
          {STATS.map((s, i) => (
            <Reveal key={s.label} as="div" index={i} className="text-center lg:px-4">
              <p className="font-display text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">{s.value}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Try it live (dedicated calculator section) ── */}
      <section id="calculator" className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute -bottom-32 left-[-6%] -z-10 size-[34rem] rounded-full bg-brand-gradient opacity-[0.1] blur-[130px]" />
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          <Reveal direction="right">
            <h2 className="text-balance font-display text-3xl font-bold tracking-tight sm:text-[2.5rem]">
              Try a live quote. <span className="text-gradient">No signup.</span>
            </h2>
            <p className="mt-3 max-w-md text-pretty text-muted-foreground">
              Punch in any two Indian pincodes and see the exact charge our API returns, computed
              by the very same engine your integration will call.
            </p>
            <ul className="mt-7 space-y-3.5">
              {[
                { icon: "zap" as IconName, title: "Real engine, real numbers", body: "Every quote here is the live /v1/rates response, never a mockup." },
                { icon: "zones" as IconName, title: "Zones, COD, fuel & GST", body: "Billable weight, zone mapping and surcharges, itemised." },
                { icon: "pin" as IconName, title: `${live.pincodes ? formatIN(live.pincodes) : "19,000+"} pincodes`, body: "Serviceability for every serviceable Indian pincode, synced from the official India Post directory." },
              ].map((f) => (
                <li key={f.title} className="flex gap-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                    <Icon name={f.icon} size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{f.title}</p>
                    <p className="text-sm text-muted-foreground">{f.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Button asChild variant="gradient" size="lg" className="mt-8">
              <Link href="/signup" data-testid="calculator-cta-signup">
                Start free
                <Icon name="arrowRight" trigger="group-hover" size={16} className="text-white" />
              </Link>
            </Button>
          </Reveal>

          <Reveal direction="left" delay={0.12} className="relative mx-auto w-full max-w-md lg:ml-auto">
            <div className="pointer-events-none absolute -inset-5 -z-10 rounded-[2.25rem] bg-brand-gradient opacity-[0.1] blur-2xl" />
            <RateCalculator compact />
          </Reveal>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6" id="features">
        <SectionHeading
          eyebrow="How it works"
          title="From signup to shipping rate in three steps"
          description="A developer-first API with the dashboard, docs and reliability you'd expect from Stripe, built for Indian logistics."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} as="div" index={i}>
              <Card className="group relative h-full p-6">
                <span className="absolute right-5 top-5 font-display text-4xl font-bold text-muted/40">
                  0{i + 1}
                </span>
                <span className="grid size-12 place-items-center rounded-2xl bg-brand-gradient-soft text-primary">
                  <Icon name={step.icon} trigger="group-hover" size={24} />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Code sample ── */}
      <section className="border-y border-border bg-card/40">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Developer experience"
              title="A clean API your team will actually enjoy"
              description="Predictable JSON, typed SDKs, idempotency keys, and a response that already includes the zone, ETA, GST and a full charge breakdown."
            />
            <Reveal as="ul" delay={0.1} className="mt-6 space-y-3">
              {["Bearer-key auth with domain & IP restrictions", "Bulk rating + serviceability endpoints", "Signed webhooks with delivery logs", "Sub-50ms responses, Redis-cached"].map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Icon name="checkCircle" size={18} className="mt-0.5 shrink-0 text-success" />
                  <span>{f}</span>
                </li>
              ))}
            </Reveal>
          </div>
          <Reveal direction="left" delay={0.1}>
            <CodeTabs tabs={CODE_TABS} testId="landing-code-tabs" />
          </Reveal>
        </div>
      </section>

      {/* ── Feature grid ── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="Platform"
          title="Everything you need to charge for shipping"
          description="Not just a calculator. A full logistics-pricing platform with the data, controls and analytics behind it."
        />
        {/* Bento with rhythm: featured cell (2-wide) + trio + full-width spotlight */}
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const featured = i === 0;
            const wide = i === FEATURES.length - 1;
            return (
              <Reveal
                key={f.title}
                as="div"
                index={i}
                stagger={0.08}
                className={cn(featured && "lg:col-span-2", wide && "md:col-span-2 lg:col-span-3")}
              >
                <Card
                  className={cn(
                    "group relative h-full overflow-hidden p-6 transition-colors hover:border-primary/30",
                    featured && "border-primary/20 bg-brand-gradient-soft",
                    wide && "flex items-start gap-5",
                  )}
                >
                {featured && (
                  <div className="pointer-events-none absolute inset-0 bg-dots opacity-40" />
                )}
                <span
                  className={cn(
                    "relative grid size-11 shrink-0 place-items-center rounded-xl text-primary",
                    featured || wide ? "bg-card shadow-sm ring-hairline" : "bg-brand-gradient-soft",
                  )}
                >
                  <Icon name={f.icon} trigger="group-hover" size={22} />
                </span>
                <div className={cn("relative", !wide && "mt-4")}>
                  <h3 className={cn("font-display font-semibold", featured ? "text-xl" : "text-base")}>
                    {f.title}
                  </h3>
                  <p className={cn("mt-1.5 text-sm text-muted-foreground", (featured || wide) && "max-w-md")}>
                    {f.body}
                  </p>
                </div>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ── Pincode sync spotlight ── */}
      <section className="relative overflow-hidden border-y border-border bg-brand-gradient">
        <div className="absolute inset-0 bg-grid opacity-10" />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-20 text-white sm:px-6 lg:grid-cols-2 lg:items-center">
          <Reveal direction="right">
            <Badge className="border-white/30 bg-white/15 text-white">The flagship module</Badge>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Your pincode master, always current.
            </h2>
            <p className="mt-4 max-w-lg text-white/85">
              Every night at 00:30 IST, Postpin pulls the official India Post directory, diffs it
              against your database, and inserts or updates pincodes automatically — with a full,
              audited log of every run and failure alerts to email or Slack. No more stale CSVs.
            </p>
            <div className="mt-6 flex flex-wrap gap-4 text-sm">
              {["Nightly sync", "CSV import", "Audited sync logs", "Sync webhooks"].map((x) => (
                <span key={x} className="flex items-center gap-1.5">
                  <Icon name="check" size={16} className="text-white" /> {x}
                </span>
              ))}
            </div>
          </Reveal>
          <Reveal direction="left" delay={0.12}>
          <Card className="border-white/10 bg-white/10 p-6 text-white backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon name="sync" trigger="loop" animation="spin" size={16} className="text-white" />
                Last sync · 10 min ago
              </span>
              <Badge className="border-white/30 bg-white/20 text-white">Synced</Badge>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { k: "Total pincodes", v: live.pincodes ? formatIN(live.pincodes) : "19,000+" },
                { k: "New", v: "+12" },
                { k: "Updated", v: "318" },
                { k: "Removed", v: "3" },
              ].map((s) => (
                <div key={s.k} className="rounded-xl bg-white/10 p-3">
                  <p className="text-xs text-white/70">{s.k}</p>
                  <p className="mt-0.5 font-display text-xl font-bold tabular-nums">{s.v}</p>
                </div>
              ))}
            </div>
          </Card>
          </Reveal>
        </div>
      </section>

      {/* ── Pricing teaser (live public plans) ── */}
      <LandingPlans />

      {/* ── Testimonials ── */}
      <section className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="Loved by builders" title="Teams ship faster with Postpin" />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} as="div" index={i}>
                <Card className="flex h-full flex-col p-6">
                <div className="flex gap-0.5 text-warning">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Icon key={i} name="star" size={15} className="text-warning" />
                  ))}
                </div>
                <p className="mt-3 flex-1 text-sm">“{t.quote}”</p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-full bg-brand-gradient-soft text-sm font-semibold text-primary">
                    {t.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Reveal blur>
        <Card className="relative overflow-hidden border-primary/20 p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute inset-0 bg-brand-gradient opacity-[0.06]" />
          <div className="relative">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Start charging accurate shipping today.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              1,000 free rate calls every month. No credit card. Upgrade when you grow.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/signup" data-testid="footer-cta-signup">
                  Start free
                  <Icon name="arrowRight" trigger="group-hover" size={17} className="text-white" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/contact" data-testid="footer-cta-contact">Talk to sales</Link>
              </Button>
            </div>
          </div>
        </Card>
        </Reveal>
      </section>
    </>
  );
}

function SectionHeading({
  title,
  description,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "center" | "left";
}) {
  return (
    <Reveal blur className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <h2 className="text-balance font-display text-3xl font-bold tracking-tight sm:text-[2.5rem]">
        {title}
      </h2>
      {description && <p className="mt-3 text-pretty text-muted-foreground">{description}</p>}
    </Reveal>
  );
}
