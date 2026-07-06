"use client";

import { useQuery } from "@tanstack/react-query";
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
import { getPublicStats } from "@/lib/api/services/public";
import { formatNumber } from "@/lib/format";

/**
 * Client islands for the /features marketing page. All three share one
 * react-query cache entry, so the page makes a single /public/stats call.
 */
function usePublicStats() {
  return useQuery({ queryKey: ["public", "stats"], queryFn: getPublicStats });
}

function CardSkeleton({ testId }: { testId: string }) {
  return (
    <div
      data-testid={testId}
      aria-hidden
      className="h-72 animate-pulse rounded-2xl border border-border bg-muted/40"
    />
  );
}

/* ── 1 · Pincode master snapshot (real coverage counts) ─────────────── */

export function SyncSnapshotCard() {
  const q = usePublicStats();
  if (q.isPending) return <CardSkeleton testId="features-sync-skeleton" />;
  if (q.isError || !q.data) return null;
  const s = q.data;

  return (
    <Card className="group p-6" data-testid="features-sync-card">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon name="sync" size={16} className="text-primary" />
          Pincode master · live coverage
        </span>
        <Badge variant="success">Live</Badge>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {[
          { k: "Total pincodes", v: formatNumber(s.pincodes) },
          { k: "States & UTs", v: formatNumber(s.states) },
          { k: "Metro pincodes", v: formatNumber(s.metros) },
          { k: "Source", v: "India Post" },
        ].map((stat) => (
          <div
            key={stat.k}
            className="rounded-xl bg-brand-gradient-soft p-3"
            data-testid={`features-sync-stat-${stat.k.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
          >
            <p className="text-xs text-muted-foreground">{stat.k}</p>
            <p className="mt-0.5 font-display text-xl font-bold tabular-nums">{stat.v}</p>
          </div>
        ))}
      </div>
      {/* Import pipeline diagram */}
      <div className="mt-5 flex items-center justify-between gap-1 rounded-xl border border-border bg-background/60 p-3">
        {[
          { icon: "database" as IconName, label: "India Post" },
          { icon: "sync" as IconName, label: "Diff" },
          { icon: "shield" as IconName, label: "Validate" },
          { icon: "checkCircle" as IconName, label: "Apply" },
        ].map((step, i, arr) => (
          <div key={step.label} className="flex flex-1 items-center gap-1">
            <div className="flex flex-1 flex-col items-center gap-1 text-center">
              <span className="grid size-9 place-items-center rounded-lg bg-card text-primary ring-1 ring-border">
                <Icon name={step.icon} size={16} />
              </span>
              <span className="text-[11px] text-muted-foreground">{step.label}</span>
            </div>
            {i < arr.length - 1 && (
              <Icon name="arrowRight" size={14} className="shrink-0 text-muted-foreground/50" />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── 2 · Zone table (real zones, SLA windows and tiers) ─────────────── */

export function ZonesTable() {
  const q = usePublicStats();
  if (q.isPending) return <CardSkeleton testId="features-zones-skeleton" />;
  if (q.isError || !q.data) return null;

  return (
    <Card className="overflow-hidden p-0" data-testid="features-zone-table">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zone</TableHead>
              <TableHead className="hidden sm:table-cell">Coverage</TableHead>
              <TableHead className="text-right">ETA</TableHead>
              <TableHead className="text-right">Tier</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.zones.map((z, i) => (
              <TableRow key={z.code} data-testid={`features-zone-row-${z.code}`}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: `var(--chart-${(i % 5) + 1})` }}
                    />
                    <span className="font-medium">{z.name}</span>
                    {z.is_special && (
                      <Badge variant="warning" className="ml-1">
                        Remote
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {z.description}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {z.sla_min}–{z.sla_max} d
                </TableCell>
                <TableCell className="text-right tabular-nums">{z.tier}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/* ── 3 · Rate-card illustration (real zones + SLA, no invented prices) ─ */

export function RateCardIllustration() {
  const q = usePublicStats();
  if (q.isPending) return <CardSkeleton testId="features-slab-skeleton" />;
  if (q.isError || !q.data) return null;

  return (
    <Card className="overflow-hidden p-0" data-testid="features-slab-table">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Zone × weight-slab rate card</p>
          <p className="text-xs text-muted-foreground">
            Draft, simulate and publish — assigned per customer
          </p>
        </div>
        <Badge variant="info">Per customer</Badge>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zone</TableHead>
              <TableHead className="text-right">Delivery SLA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.zones.map((z) => (
              <TableRow key={z.code} data-testid={`features-slab-row-${z.code}`}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{z.name}</span>
                    {z.is_special && (
                      <Badge variant="warning" className="ml-1">
                        Remote
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {z.sla_min}–{z.sla_max} days
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        Slab pricing (≤500 g, ≤1 kg, ≤2 kg, +500 g) is defined per card in your dashboard — with
        COD, fuel and GST overrides.
      </p>
    </Card>
  );
}
