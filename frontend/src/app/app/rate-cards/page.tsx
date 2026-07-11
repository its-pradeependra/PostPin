"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { getRateCards, type FeZone, type RateCardDto, type RateCardRowDto } from "@/lib/api/services/rate-cards";
import { formatCurrency, formatPercent, formatDate, formatNumber } from "@/lib/format";

// Weight-slab column headers, aligned to RateCardRowDto.slabs order
// (0-500g, 501-1000g, 1001-2000g, "and above") + the per-500g extra.
const SLAB_HEADERS = ["0–500 g", "501 g – 1 kg", "1 – 2 kg", "Extra / 500 g"] as const;

const ZONE_DOT: Record<FeZone, string> = {
  local: "bg-success",
  regional: "bg-info",
  metro: "bg-primary",
  national: "bg-brand-accent",
  special: "bg-warning",
};

function slabAmount(row: RateCardRowDto, index: number): number {
  // Columns 0–2 read straight from the slab prices; the last column is the
  // per-500g step add-on used for anything above 2 kg.
  if (index < 3) return row.slabs[index]?.price ?? 0;
  return row.extraPer500g;
}

export default function RateCardsPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["rate-cards"], queryFn: getRateCards });
  const rateCards = data?.cards ?? [];
  const zones = data?.zones ?? [];

  const publishedCards = rateCards.filter((c) => c.status === "published");
  const [activeId, setActiveId] = useState<string>("");
  const effectiveActiveId = activeId || publishedCards[0]?.id || rateCards[0]?.id || "";
  const activeCard: RateCardDto | undefined = rateCards.find((c) => c.id === effectiveActiveId);

  return (
    <div className="space-y-6" data-testid="rate-cards-page">
      <PageHeader
        title="Rate cards"
        description="Audit the negotiated slab grid and surcharges that drive every quote on your account."
        eyebrow="Develop"
      >
        <Button variant="outline" asChild className="group" data-testid="ratecard-custom-pricing-btn">
          <Link href="/app/support/new">
            <Icon name="sparkles" size={16} />
            Request custom pricing
          </Link>
        </Button>
      </PageHeader>

      {/* Intro context alert */}
      <Alert variant="info" data-testid="ratecard-intro-alert">
        <Icon name="rateCard" size={16} />
        <AlertTitle>These are the rate cards applied to your account</AlertTitle>
        <AlertDescription>
          Rate cards are read-only here. Pricing is negotiated with our team — request a custom card if
          your volumes have changed.
        </AlertDescription>
      </Alert>

      <QueryBoundary isLoading={isLoading} error={error} onRetry={() => void refetch()}>
      {rateCards.length === 0 ? (
        <EmptyState
          icon="rateCard"
          title="No rate cards yet"
          description="Once a rate card is assigned to your account it will appear here."
          testId="ratecard-empty"
        >
          <Button variant="gradient" asChild className="group" data-testid="ratecard-empty-cta">
            <Link href="/app/support/new">
              <Icon name="send" size={16} className="text-white" />
              Talk to sales
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* Card selector grid */}
          <section className="space-y-3" data-testid="ratecard-list">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Your cards
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatNumber(rateCards.length)} total
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rateCards.map((card) => {
                const selected = card.id === activeId;
                const isDraft = card.status === "draft";
                return (
                  <Card
                    key={card.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => !isDraft && setActiveId(card.id)}
                    onKeyDown={(e) => {
                      if (!isDraft && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        setActiveId(card.id);
                      }
                    }}
                    aria-pressed={selected}
                    aria-disabled={isDraft}
                    data-testid={`ratecard-card-${card.id}`}
                    className={cn(
                      "group relative transition-all",
                      isDraft
                        ? "cursor-not-allowed opacity-70"
                        : "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
                      selected && "ring-2 ring-primary shadow-glow",
                    )}
                  >
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                          <Icon name="rateCard" size={18} />
                        </span>
                        <div className="min-w-0">
                          <CardTitle className="truncate text-base">{card.name}</CardTitle>
                          <CardDescription className="truncate">
                            {card.assignedTo === "—" ? "Unassigned" : card.assignedTo}
                          </CardDescription>
                        </div>
                      </div>
                      <CardAction>
                        <StatusBadge status={card.status} testId={`ratecard-status-${card.id}`} />
                      </CardAction>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Effective from</span>
                        <span className="font-medium tabular-nums">{formatDate(card.effectiveFrom)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Currency</span>
                        <span className="font-mono text-xs font-medium">{card.currency}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Last updated</span>
                        <span className="font-medium tabular-nums">{formatDate(card.updatedAt)}</span>
                      </div>
                    </CardContent>
                    <CardFooter>
                      {isDraft ? (
                        <Badge variant="muted" className="gap-1.5">
                          <Icon name="lock" size={12} />
                          Not yet active
                        </Badge>
                      ) : selected ? (
                        <Badge variant="gradient" className="gap-1.5" data-testid={`ratecard-active-${card.id}`}>
                          <Icon name="check" size={12} className="text-white" />
                          Viewing
                        </Badge>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                          View slabs
                          <Icon name="arrowRight" size={13} />
                        </span>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Active card detail: slab table + surcharges */}
          {activeCard && (
            <Card data-testid="ratecard-active-detail">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                  {activeCard.name}
                  <StatusBadge status={activeCard.status} />
                </CardTitle>
                <CardDescription>
                  Freight per zone × weight slab, in {activeCard.currency}. Effective from{" "}
                  {formatDate(activeCard.effectiveFrom)}.
                </CardDescription>
                <CardAction>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="group"
                    data-testid="ratecard-how-quote-btn"
                  >
                    <Link href="/app/playground">
                      <Icon name="calculator" size={15} />
                      How a quote is built
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Slab matrix: zones as rows, weight slabs as columns */}
                <div className="overflow-hidden rounded-xl border border-border">
                  <Table data-testid="ratecard-slab-table">
                    <TableCaption className="px-4">
                      Base freight covers the slab; anything over 2 kg adds the “Extra / 500 g” step.
                    </TableCaption>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="sticky left-0 bg-muted/40 backdrop-blur min-w-[140px]">
                          Zone
                        </TableHead>
                        {SLAB_HEADERS.map((h) => (
                          <TableHead key={h} className="text-right whitespace-nowrap">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeCard.rows.map((row) => (
                        <TableRow key={row.zone} data-testid={`ratecard-slab-row-${row.zone}`}>
                          <TableHead
                            scope="row"
                            className="sticky left-0 bg-card font-medium text-foreground"
                          >
                            <span className="flex items-center gap-2">
                              <span className={cn("size-2 rounded-full", ZONE_DOT[row.zone])} />
                              {row.zoneLabel}
                            </span>
                          </TableHead>
                          {SLAB_HEADERS.map((_, i) => (
                            <TableCell
                              key={i}
                              className={cn(
                                "text-right font-mono tabular-nums",
                                i === 3 && "text-muted-foreground",
                              )}
                            >
                              {i === 3 ? "+ " : ""}
                              {formatCurrency(slabAmount(row, i), activeCard.currency)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Surcharges row */}
                <div className="space-y-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Icon name="percent" size={15} className="text-primary" />
                    Surcharges &amp; taxes
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="ratecard-surcharges">
                    <SurchargeTile
                      testId="ratecard-surcharge-cod"
                      icon="wallet"
                      label="COD fee"
                      value={`${formatCurrency(activeCard.codFlat, activeCard.currency)} + ${formatPercent(
                        activeCard.codPercent / 100,
                        1,
                      )}`}
                      hint="Flat fee plus a percentage of the collected amount."
                    />
                    <SurchargeTile
                      testId="ratecard-surcharge-fuel"
                      icon="truck"
                      label="Fuel surcharge"
                      value={formatPercent(activeCard.fuelPercent / 100, 0)}
                      hint="Applied on freight to offset fuel price movement."
                    />
                    <SurchargeTile
                      testId="ratecard-surcharge-gst"
                      icon="audit"
                      label="GST"
                      value={formatPercent(activeCard.gstPercent / 100, 0)}
                      hint="Goods & Services Tax added to the final invoice."
                    />
                    <SurchargeTile
                      testId="ratecard-surcharge-remote"
                      icon="map"
                      label="Remote zones"
                      value="Special slab"
                      hint="NE states, J&K and islands use the Special / Remote freight slab."
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Zone legend with ETA */}
          <Card data-testid="ratecard-zone-legend">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Icon name="zones" size={18} className="text-primary" />
                Zone matrix
              </CardTitle>
              <CardDescription>
                How destinations map to zones, with the delivery window we quote.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {zones.map((zone) => (
                  <div
                    key={zone.id}
                    data-testid={`ratecard-zone-${zone.id}`}
                    className="group flex flex-col gap-2 rounded-xl border border-border bg-card/50 p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className={cn("size-2.5 rounded-full", ZONE_DOT[zone.id])} />
                        {zone.label}
                      </span>
                      <div className="flex items-center gap-1">
                        {zone.metro && (
                          <Badge variant="secondary" className="text-[10px]">
                            Metro
                          </Badge>
                        )}
                        {zone.remote && (
                          <Badge variant="warning" className="text-[10px]">
                            Remote
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{zone.description}</p>
                    <div className="mt-auto flex items-center justify-between pt-1 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                        <Icon name="clock" size={13} className="text-primary" />
                        {zone.etaDays[0]}–{zone.etaDays[1]} days
                      </span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        Tier {zone.tier}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Need different terms for your account?
              </p>
              <Button variant="link" size="sm" asChild className="group h-auto p-0" data-testid="ratecard-support-link">
                <Link href="/app/support/new">
                  Request custom pricing
                  <Icon name="arrowRight" size={14} />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </>
      )}
      </QueryBoundary>
    </div>
  );
}

function SurchargeTile({
  icon,
  label,
  value,
  hint,
  testId,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: string;
  hint: string;
  testId: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            data-testid={testId}
            className="group flex items-start gap-3 rounded-xl border border-border bg-card/50 p-3 text-left"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-gradient-soft text-primary">
              <Icon name={icon} size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="truncate font-display font-semibold tabular-nums">{value}</p>
            </div>
            <Icon name="lock" size={12} className="ml-auto mt-0.5 text-muted-foreground" />
          </div>
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
