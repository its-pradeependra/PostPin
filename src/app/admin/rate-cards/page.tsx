"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getAdminRateCards } from "@/lib/api/services/admin";
import { formatCurrency, formatDate } from "@/lib/format";

export default function AdminRateCardsPage() {
  const q = useQuery({ queryKey: ["admin", "rate-cards"], queryFn: getAdminRateCards });
  const standard = q.data?.standard ?? [];
  const custom = q.data?.custom ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Rate cards"
        description="The zone-rate matrix the live engine prices on, plus every tenant-defined custom card across the platform."
      />

      {/* Deferral notice (create / edit / assign / simulate are deferred) */}
      <div
        data-testid="ratecard-deferred-note"
        className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
      >
        <Icon name="lock" size={15} />
        <span>
          Tenant rate-card editing lives in the tenant portal; platform-side card assignment is
          coming soon.
        </span>
      </div>

      <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
        {/* ── Standard engine matrix ── */}
        <Card data-testid="ratecard-standard-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <Icon name="rateCard" size={18} className="text-primary" />
              Standard rate card
            </CardTitle>
            <CardDescription>
              The live engine matrix — tenants without a custom card price on these zone rates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {standard.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                The engine hasn&apos;t published standard zone rates yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table data-testid="ratecard-standard-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Zone</TableHead>
                      <TableHead className="text-right">Base charge</TableHead>
                      <TableHead className="text-right">Per kg</TableHead>
                      <TableHead>SLA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {standard.map((row) => (
                      <TableRow
                        key={row.zone}
                        data-testid={`ratecard-standard-row-${row.zone}`}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon name="zones" size={15} className="text-primary" />
                            <span className="font-medium">{row.name}</span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {row.zone}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatCurrency(row.base_charge)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatCurrency(row.per_kg)}/kg
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          {row.sla_min}–{row.sla_max} days
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Custom cards ── */}
        <section className="space-y-3" data-testid="ratecard-custom-section">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-lg font-semibold">Custom rate cards</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {custom.length} card{custom.length === 1 ? "" : "s"}
            </span>
          </div>

          {custom.length === 0 ? (
            <EmptyState
              icon="rateCard"
              title="No custom rate cards yet"
              description="Tenants create custom cards from their portal — they'll show up here as soon as one exists."
              testId="ratecard-empty-state"
            />
          ) : (
            <Card className="overflow-hidden p-0" data-testid="ratecard-list-card">
              <div className="overflow-x-auto">
                <Table data-testid="ratecard-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Rate card</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead className="text-right">Slabs</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {custom.map((card) => (
                      <TableRow key={card.id} data-testid={`ratecard-row-${card.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-gradient-soft text-primary">
                              <Icon name="rateCard" size={16} />
                            </span>
                            <span className="font-display font-semibold">{card.name}</span>
                          </div>
                        </TableCell>
                        <TableCell
                          className="font-mono text-xs text-muted-foreground"
                          data-testid={`ratecard-code-${card.id}`}
                        >
                          {card.code}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={card.status}
                            testId={`ratecard-status-${card.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/admin/users/${card.company_id}`}
                            className="text-sm font-medium text-foreground hover:text-primary"
                            data-testid={`ratecard-tenant-link-${card.id}`}
                          >
                            {card.company_name}
                          </Link>
                        </TableCell>
                        <TableCell
                          className="text-right font-mono text-sm tabular-nums"
                          data-testid={`ratecard-slabs-${card.id}`}
                        >
                          {card.slabs}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(card.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </section>
      </QueryBoundary>
    </div>
  );
}
