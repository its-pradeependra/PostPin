"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/marketing/reveal";
import { getPublicPlans, type PublicPlan } from "@/lib/api/services/public";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

function priceLabel(p: PublicPlan) {
  if (p.price_monthly_paise < 0) return "Custom";
  return formatCurrency(p.price_monthly_paise / 100, "INR", { maximumFractionDigits: 0 });
}

function callsLabel(p: PublicPlan) {
  if (p.included_calls < 0) return "Unlimited calls";
  return `${(p.included_calls / 1000).toLocaleString("en-IN")}k calls included`;
}

/**
 * Pricing teaser — real public plans from /public/plans (paise → ₹).
 * Client island so the rest of the landing page stays a server component.
 */
export function LandingPlans() {
  const q = useQuery({ queryKey: ["public", "plans"], queryFn: getPublicPlans });

  // Mirror the old teaser: skip the free tier, feature the next three paid plans.
  const teaser = (q.data ?? [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter((p) => p.price_monthly_paise !== 0)
    .slice(0, 3);

  // Quietly drop the section if plans can't load — marketing pages shouldn't
  // surface an error card for a teaser strip.
  if (q.isError) return null;

  const highlightIdx = teaser.length === 3 ? 1 : -1;

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6" data-testid="landing-plans-section">
      <Reveal blur className="mx-auto max-w-2xl text-center">
        <h2 className="text-balance font-display text-3xl font-bold tracking-tight sm:text-[2.5rem]">
          Flat plans, predictable overages
        </h2>
        <p className="mt-3 text-pretty text-muted-foreground">
          Start free. Scale to millions of calls. Pay only for what you ship.
        </p>
      </Reveal>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {q.isPending
          ? [0, 1, 2].map((i) => (
              <div
                key={i}
                data-testid="landing-plans-skeleton"
                className="h-60 animate-pulse rounded-2xl border border-border bg-muted/40"
                aria-hidden
              />
            ))
          : teaser.map((p, i) => {
              const highlight = i === highlightIdx;
              return (
                <Reveal key={p.code} as="div" index={i}>
                  <Card
                    data-testid={`landing-plan-card-${p.code}`}
                    className={cn("h-full", highlight ? "relative border-primary/40 p-6 shadow-glow" : "p-6")}
                  >
                    {highlight && (
                      <Badge variant="gradient" className="absolute -top-2.5 left-6">
                        Most popular
                      </Badge>
                    )}
                    <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                    <p className="text-sm text-muted-foreground">{p.description}</p>
                    <p className="mt-4 font-display text-3xl font-bold tracking-tight">
                      {priceLabel(p)}
                      {p.price_monthly_paise >= 0 && (
                        <span className="text-sm font-normal text-muted-foreground">/mo</span>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground tabular-nums">{callsLabel(p)}</p>
                    <Button asChild variant={highlight ? "gradient" : "outline"} className="mt-5 w-full">
                      <Link href="/signup" data-testid={`pricing-teaser-${p.code}`}>
                        Choose {p.name}
                      </Link>
                    </Button>
                  </Card>
                </Reveal>
              );
            })}
      </div>
      <div className="mt-6 text-center">
        <Link
          href="/pricing"
          className="text-sm font-semibold text-primary hover:underline"
          data-testid="landing-plans-compare-link"
        >
          Compare all plans →
        </Link>
      </div>
    </section>
  );
}
