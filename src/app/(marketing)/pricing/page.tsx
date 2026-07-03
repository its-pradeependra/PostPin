"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Icon } from "@/components/icons";
import { Reveal } from "@/components/marketing/reveal";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { getPublicPlans, type PublicPlan } from "@/lib/api/services/public";
import { formatCurrency, formatCompact, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/types";

type Billing = "monthly" | "yearly";

function priceLabel(plan: Plan, billing: Billing) {
  if (plan.priceMonthly < 0) return "Custom";
  if (plan.priceMonthly === 0) return formatCurrency(0, "INR", { maximumFractionDigits: 0 });
  const amount = billing === "monthly" ? plan.priceMonthly : plan.priceYearly;
  return formatCurrency(amount, "INR", { maximumFractionDigits: 0 });
}

const PLAN_ORDER: Plan["id"][] = ["free", "starter", "growth", "scale", "enterprise"];

/** Map the public API plan (money in paise) to the shape this page renders (rupees). */
function toPlan(p: PublicPlan): Plan {
  return {
    id: p.code as Plan["id"],
    name: p.name,
    tagline: p.description,
    priceMonthly: p.price_monthly_paise < 0 ? -1 : p.price_monthly_paise / 100,
    priceYearly: p.price_yearly_paise < 0 ? -1 : p.price_yearly_paise / 100,
    includedCalls: p.included_calls,
    overagePer1k: (p.overage_per_1k_paise ?? 0) / 100,
    rateLimitRpm: p.rate_limit.rpm,
    features: p.features,
    highlight: p.code === "growth",
    badge: p.code === "growth" ? "Most popular" : undefined,
  };
}

// Comparison matrix. `null` => not included (rendered as a quiet rule, not a dash).
const COMPARISON: {
  feature: string;
  icon: Parameters<typeof Icon>[0]["name"];
  values: Record<Plan["id"], string | null>;
}[] = [
  { feature: "Monthly rate calls", icon: "calculator", values: { free: "1,000", starter: "25,000", growth: "2,50,000", scale: "15,00,000", enterprise: "Custom" } },
  { feature: "Overage / 1,000 calls", icon: "coins", values: { free: "Hard block", starter: "₹9", growth: "₹7", scale: "₹5", enterprise: "Negotiated" } },
  { feature: "API keys", icon: "keys", values: { free: "1", starter: "3", growth: "10", scale: "Unlimited", enterprise: "Unlimited" } },
  { feature: "Allowed domains", icon: "globe", values: { free: "1", starter: "5", growth: "Unlimited", scale: "Unlimited", enterprise: "Unlimited" } },
  { feature: "Rate limit (RPM)", icon: "gauge", values: { free: "30", starter: "120", growth: "600", scale: "2,000", enterprise: "10,000+" } },
  { feature: "Webhooks & events", icon: "webhook", values: { free: null, starter: "✓", growth: "✓", scale: "✓", enterprise: "✓" } },
  { feature: "Custom rate cards", icon: "rateCard", values: { free: null, starter: "Standard", growth: "✓", scale: "✓", enterprise: "✓" } },
  { feature: "Uptime SLA", icon: "shieldCheck", values: { free: null, starter: null, growth: "99.9%", scale: "Sub-50ms p99", enterprise: "Custom SLA + DPA" } },
  { feature: "Support", icon: "headphones", values: { free: "Community", starter: "Email", growth: "Priority", scale: "24×7 + Slack", enterprise: "Solutions engineer" } },
];

const FAQS: { q: string; a: string }[] = [
  { q: "What happens if I exceed my included calls?", a: "On paid plans, extra calls are billed per 1,000 at your plan's overage rate (Starter ₹9, Growth ₹7, Scale ₹5). On the Free plan, requests are hard-blocked once you hit 1,000 calls in a month, so you are never silently billed. Enterprise volume is negotiated up front." },
  { q: "Can I switch between monthly and yearly billing?", a: "Yes. Yearly billing is charged annually at roughly a 16-20% discount versus paying monthly, and you can switch at any time. When you upgrade mid-cycle we prorate the difference; downgrades take effect at your next renewal." },
  { q: "How fresh is the India Post pincode data?", a: "Postpin syncs the India Post pincode directory nightly at 00:30 IST. New, updated and retired pincodes are diffed into your serviceability database automatically, with full sync logs and one-click rollback, so quotes are always based on current data on every plan." },
  { q: "Are GST invoices included?", a: "Every paid invoice is a GST-compliant tax invoice with your GSTIN, available to download from the billing dashboard. Listed prices are exclusive of 18% GST, which is added at checkout." },
  { q: "Do you offer refunds?", a: "Monthly plans can be cancelled any time and simply stop renewing, with no lock-ins. For yearly plans we offer a 14-day money-back guarantee on the first term. Usage-based overages already consumed are non-refundable." },
  { q: "Can I try before I pay?", a: "Absolutely. The Free plan gives you 1,000 live rate calls every month with no credit card required, plus a full test environment with separate test keys so you can build and verify your integration end to end." },
];

export default function PricingPage() {
  const [billing, setBilling] = useState<Billing>("monthly");

  const plansQ = useQuery({ queryKey: ["public", "plans"], queryFn: getPublicPlans });
  const orderedPlans = useMemo(() => {
    const mapped = (plansQ.data ?? []).map(toPlan);
    return PLAN_ORDER.map((id) => mapped.find((p) => p.id === id)).filter((p): p is Plan => Boolean(p));
  }, [plansQ.data]);
  // Three featured tiers in the card row; Scale + Enterprise live in the high-volume band below.
  const cardPlans = orderedPlans.filter((p) => p.id !== "enterprise" && p.id !== "scale");
  const scale = orderedPlans.find((p) => p.id === "scale");
  const enterprise = orderedPlans.find((p) => p.id === "enterprise");

  // Data-backed comparison rows come from the LIVE plans (same source as the
  // cards) so the table can never drift from real pricing; the remaining rows
  // are marketing-only facts not present in the plans API.
  const comparison = useMemo(() => {
    const fromPlans = (fn: (p: Plan) => string | null) =>
      Object.fromEntries(orderedPlans.map((p) => [p.id, fn(p)])) as Record<Plan["id"], string | null>;
    return COMPARISON.map((row) => {
      if (row.feature === "Monthly rate calls") {
        return { ...row, values: fromPlans((p) => (p.includedCalls < 0 ? "Custom" : formatNumber(p.includedCalls))) };
      }
      if (row.feature === "Overage / 1,000 calls") {
        return {
          ...row,
          values: fromPlans((p) =>
            p.id === "free" ? "Hard block" : p.id === "enterprise" ? "Negotiated" : formatCurrency(p.overagePer1k, "INR", { maximumFractionDigits: 0 }),
          ),
        };
      }
      if (row.feature === "Rate limit (RPM)") {
        return { ...row, values: fromPlans((p) => p.rateLimitRpm.toLocaleString("en-IN")) };
      }
      return row;
    });
  }, [orderedPlans]);

  return (
    <>
      {/* ── Header ── */}
      <section className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
        <div className="pointer-events-none absolute -top-28 left-1/2 -z-10 size-[40rem] -translate-x-1/2 rounded-full bg-brand-gradient opacity-[0.14] blur-[130px]" />
        <div className="mx-auto max-w-3xl px-4 pb-4 pt-16 text-center sm:px-6 lg:pt-24">
          <Reveal blur>
            <h1 className="text-balance font-display text-[2.75rem] font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Pricing that scales <span className="text-gradient">with every shipment.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
              Start free with 1,000 calls a month. Flat plans, predictable overages, GST invoices.
              Pay only for what you ship.
            </p>
          </Reveal>
          <BillingToggle billing={billing} onChange={setBilling} />
        </div>
      </section>

      {/* ── Plan cards (4) ── */}
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6" data-testid="pricing-plan-grid">
        <QueryBoundary
          isLoading={plansQ.isLoading}
          error={plansQ.error}
          skeleton={<PlanCardsSkeleton />}
          onRetry={() => plansQ.refetch()}
        >
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3 lg:gap-7">
          {cardPlans.map((plan, i) => {
            const isFree = plan.priceMonthly === 0;
            const yearly = billing === "yearly" && !isFree;
            return (
              <Reveal key={plan.id} as="div" index={i}>
                <Card
                  data-testid={`pricing-plan-card-${plan.id}`}
                  className={cn(
                    "relative flex h-full flex-col p-6 transition-shadow duration-200",
                    plan.highlight
                      ? "border-primary/40 shadow-lg"
                      : "shadow-sm hover:shadow-md",
                  )}
                >
                  {plan.highlight && (
                    <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand-gradient px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm">
                      <Icon name="sparkles" size={11} className="text-white" />
                      Most popular
                    </span>
                  )}

                  <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
                  <p className="mt-1.5 min-h-10 text-sm leading-relaxed text-muted-foreground">{plan.tagline}</p>

                  <div className="mt-6 min-h-18">
                    <motion.p
                      key={priceLabel(plan, billing)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      className="font-display text-4xl font-bold tracking-tight tabular-nums"
                    >
                      {priceLabel(plan, billing)}
                      {!isFree && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
                    </motion.p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {isFree ? "free forever" : yearly ? "billed yearly · +18% GST" : "billed monthly · +18% GST"}
                    </p>
                  </div>

                  <div className="mt-5 rounded-xl border border-border bg-muted/40 px-4 py-3">
                    <p className="text-sm font-semibold tabular-nums">
                      {plan.includedCalls < 0 ? "Unlimited" : formatCompact(plan.includedCalls)} calls / mo
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">{plan.rateLimitRpm.toLocaleString("en-IN")} requests / min</p>
                  </div>

                  <Button asChild variant={plan.highlight ? "gradient" : "outline"} className="mt-6 w-full">
                    <Link href={isFree ? "/signup?plan=free" : `/signup?plan=${plan.id}`} data-testid={`pricing-${plan.id}-select-btn`}>
                      {isFree ? "Start free" : `Choose ${plan.name}`}
                      {plan.highlight && <Icon name="arrowRight" trigger="group-hover" size={16} className="text-white" />}
                    </Link>
                  </Button>

                  <ul className="mt-7 space-y-3 border-t border-border pt-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm leading-relaxed">
                        <Icon name="check" size={16} className="mt-0.5 shrink-0 text-success" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </Reveal>
            );
          })}
        </div>
        </QueryBoundary>
      </section>

      {/* ── High-volume band: Scale + Enterprise ── */}
      <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <Reveal className="mx-auto max-w-5xl">
          <div className="mb-5 flex items-center gap-3">
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              High volume
            </h2>
            <span className="h-px flex-1 bg-border" />
          </div>
          {plansQ.isLoading ? (
            <div className="grid gap-6 lg:grid-cols-2" data-testid="pricing-highvolume-skeleton">
              <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
              <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
            </div>
          ) : scale && enterprise ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Scale */}
            <Card
              data-testid="pricing-plan-card-scale"
              className="relative flex h-full flex-col gap-6 p-7 shadow-sm transition-shadow duration-200 hover:shadow-md sm:p-8"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-foreground">
                    <Icon name="gauge" size={20} />
                  </span>
                  <div>
                    <h3 className="font-display text-2xl font-bold tracking-tight">{scale.name}</h3>
                    <p className="text-sm text-muted-foreground">{scale.tagline}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <motion.p
                    key={priceLabel(scale, billing)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="font-display text-3xl font-bold tracking-tight tabular-nums"
                  >
                    {priceLabel(scale, billing)}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </motion.p>
                  <p className="text-xs text-muted-foreground">
                    {billing === "yearly" ? "billed yearly" : "billed monthly"} · +18% GST
                  </p>
                </div>
              </div>
              <ul className="grid gap-x-5 gap-y-2.5 text-sm sm:grid-cols-2">
                {scale.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 leading-relaxed">
                    <Icon name="check" size={15} className="mt-0.5 shrink-0 text-success" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" className="mt-auto w-full sm:w-auto sm:self-start">
                <Link href="/signup?plan=scale" data-testid="pricing-scale-select-btn">
                  Choose Scale
                </Link>
              </Button>
            </Card>

            {/* Enterprise */}
            <Card
              data-testid="pricing-plan-card-enterprise"
              className="relative flex h-full flex-col gap-6 overflow-hidden border-primary/25 p-7 shadow-sm sm:p-8"
            >
              <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
              <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-brand-gradient opacity-10 blur-3xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow">
                    <Icon name="company" size={20} className="text-white" />
                  </span>
                  <div>
                    <h3 className="font-display text-2xl font-bold tracking-tight">{enterprise.name}</h3>
                    <p className="text-sm text-muted-foreground">{enterprise.tagline}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-3xl font-bold tracking-tight">Custom</p>
                  <p className="text-xs text-muted-foreground">tailored volume</p>
                </div>
              </div>
              <ul className="relative grid gap-x-5 gap-y-2.5 text-sm sm:grid-cols-2">
                {["Custom volume & pricing", "SSO / SAML + audit export", "Dedicated infrastructure", "10,000+ RPM"].map((f) => (
                  <li key={f} className="flex items-start gap-2 leading-relaxed">
                    <Icon name="check" size={15} className="mt-0.5 shrink-0 text-success" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button asChild variant="gradient" className="relative mt-auto w-full sm:w-auto sm:self-start">
                <Link href="/contact?interest=sales&plan=enterprise" data-testid="pricing-enterprise-contact-btn">
                  Contact sales
                  <Icon name="arrowRight" trigger="group-hover" size={16} className="text-white" />
                </Link>
              </Button>
            </Card>
          </div>
          ) : null}
        </Reveal>
      </section>

      {/* ── Comparison table ── */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <Reveal blur className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-[2.5rem]">
            Every feature, side by side
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground">
            The full breakdown across plans. Switch the billing period above to see your price.
          </p>
        </Reveal>

        {plansQ.isLoading ? (
          <div className="mt-10 h-96 animate-pulse rounded-2xl border border-border bg-muted/40" data-testid="pricing-comparison-skeleton" />
        ) : orderedPlans.length > 0 ? (
        <Reveal className="mt-10 overflow-x-auto rounded-2xl border border-border">
          <Table data-testid="pricing-comparison-table" className="min-w-[760px]">
            <TableHeader>
              <TableRow className="bg-card/40 hover:bg-card/40">
                <TableHead className="sticky left-0 z-10 min-w-[200px] bg-card/40 backdrop-blur">Feature</TableHead>
                {orderedPlans.map((plan) => (
                  <TableHead key={plan.id} className={cn("text-center", plan.highlight && "text-primary")}>
                    <span className="flex items-center justify-center gap-1.5 font-display text-sm font-semibold">
                      {plan.name}
                      {plan.highlight && <Icon name="star" size={12} className="text-primary" />}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.map((row) => (
                <TableRow key={row.feature} data-testid={`pricing-compare-row-${row.feature.replace(/\s+/g, "-").toLowerCase()}`}>
                  <TableCell className="sticky left-0 z-10 bg-background font-medium">
                    <span className="flex items-center gap-2">
                      <Icon name={row.icon} size={15} className="shrink-0 text-muted-foreground" />
                      {row.feature}
                    </span>
                  </TableCell>
                  {orderedPlans.map((plan) => {
                    const v = row.values[plan.id];
                    return (
                      <TableCell key={plan.id} className={cn("text-center text-sm tabular-nums", plan.highlight && "bg-primary/[0.04]")}>
                        {v === "✓" ? (
                          <Icon name="check" size={16} className="mx-auto text-success" />
                        ) : v == null ? (
                          <span className="mx-auto inline-block h-px w-3 bg-muted-foreground/40 align-middle" aria-label="Not included" />
                        ) : (
                          <span>{v}</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Reveal>
        ) : null}
        <p className="mt-3 text-center text-xs text-muted-foreground">
          All prices are exclusive of 18% GST. {formatNumber(157238)} pincodes synced from India Post on every plan.
        </p>
      </section>

      {/* ── FAQ ── */}
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Reveal blur className="text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-[2.5rem]">
            Pricing questions, answered
          </h2>
        </Reveal>
        <Reveal>
          <Accordion type="single" collapsible className="mt-8" data-testid="pricing-faq-accordion">
            {FAQS.map((faq, i) => (
              <AccordionItem key={faq.q} value={`faq-${i}`}>
                <AccordionTrigger data-testid={`pricing-faq-trigger-${i}`} className="text-left font-display text-base">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent>{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </section>

      {/* ── Final CTA band ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Reveal blur>
          <Card className="relative overflow-hidden border-primary/20 p-10 text-center sm:p-16">
            <div className="pointer-events-none absolute inset-0 bg-brand-gradient opacity-[0.06]" />
            <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
            <div className="relative">
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Ship accurate rates today.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
                1,000 free rate calls every month. No credit card. Upgrade the moment you outgrow it.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button asChild variant="gradient" size="lg">
                  <Link href="/signup" data-testid="pricing-final-cta-signup-btn">
                    Start free
                    <Icon name="arrowRight" trigger="group-hover" size={17} className="text-white" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/contact" data-testid="pricing-final-cta-contact-btn">
                    <Icon name="message" trigger="group-hover" size={17} />
                    Talk to sales
                  </Link>
                </Button>
              </div>
              <p className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Icon name="check" size={15} className="text-success" /> GST invoices</span>
                <span className="flex items-center gap-1.5"><Icon name="check" size={15} className="text-success" /> INR-native</span>
                <span className="flex items-center gap-1.5"><Icon name="check" size={15} className="text-success" /> No lock-in</span>
              </p>
            </div>
          </Card>
        </Reveal>
      </section>
    </>
  );
}

/* ── Subtle skeleton for the plan-card row while public plans load ── */
function PlanCardsSkeleton() {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3 lg:gap-7" data-testid="pricing-plans-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-112 animate-pulse rounded-xl border border-border bg-muted/40" />
      ))}
    </div>
  );
}

/* ── Billing period toggle: sliding gradient pill (motion layoutId) ── */
function BillingToggle({ billing, onChange }: { billing: Billing; onChange: (b: Billing) => void }) {
  const options: { id: Billing; label: string }[] = [
    { id: "monthly", label: "Monthly" },
    { id: "yearly", label: "Yearly" },
  ];
  return (
    <div className="mt-9 flex flex-col items-center gap-3">
      <div
        role="tablist"
        aria-label="Billing period"
        data-testid="pricing-billing-toggle"
        className="relative inline-flex items-center rounded-full border border-border bg-muted/60 p-1"
      >
        {options.map((o) => {
          const active = billing === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(o.id)}
              data-testid={`pricing-billing-${o.id}-btn`}
              className="relative inline-flex items-center gap-2 rounded-full px-5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {active && (
                <motion.span
                  layoutId="billing-pill"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="absolute inset-0 -z-10 rounded-full bg-card shadow-sm ring-1 ring-border"
                />
              )}
              <span className={active ? "text-foreground" : "text-muted-foreground"}>{o.label}</span>
              {o.id === "yearly" && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums transition-colors",
                    active ? "bg-success/15 text-success" : "bg-success/10 text-success/80",
                  )}
                >
                  −20%
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Save ~20% with yearly billing — switch anytime.
      </p>
    </div>
  );
}
