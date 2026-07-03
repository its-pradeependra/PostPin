"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ChartCard, AreaTrend, BarList } from "@/components/shared/charts";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { getAdminUsageReport } from "@/lib/api/services/admin";
import {
  formatCompact,
  formatNumber,
  formatPercent,
  formatLatency,
  formatDate,
} from "@/lib/format";

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;

type RangeValue = (typeof RANGES)[number]["value"];

type AnomalyFlag = {
  id: string;
  severity: "critical" | "warning";
  icon: "trending" | "shield";
  title: string;
  detail: string;
  href?: string;
  actionLabel?: string;
};

const SEVERITY_STYLES = {
  critical: {
    badge: "destructive" as const,
    tint: "bg-destructive/10",
    ring: "border-destructive/30",
    iconWrap: "bg-destructive/12 text-destructive",
    label: "Critical",
  },
  warning: {
    badge: "warning" as const,
    tint: "bg-warning/10",
    ring: "border-warning/30",
    iconWrap: "bg-warning/15 text-warning",
    label: "Warning",
  },
};

/** Stable slug for endpoint-derived testids / flag ids. */
function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function csvEscape(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export default function AdminUsageReportsPage() {
  const [range, setRange] = React.useState<RangeValue>("30");
  const days = Number(range);

  const rangeLabel =
    RANGES.find((r) => r.value === range)?.label ?? `Last ${days} days`;

  const q = useQuery({
    queryKey: ["admin", "usage-report", days],
    queryFn: () => getAdminUsageReport(days),
  });

  const report = q.data;
  const summary = report?.summary;
  const series = React.useMemo(() => report?.series ?? [], [report]);
  const endpoints = React.useMemo(() => report?.endpoints ?? [], [report]);
  const consumers = React.useMemo(() => report?.top_consumers ?? [], [report]);

  // Total platform volume area chart.
  const volumeData = React.useMemo(
    () =>
      series.map((p) => ({
        label: formatDate(p.date, "short"),
        calls: p.calls,
      })),
    [series],
  );

  const sortedConsumers = React.useMemo(
    () => [...consumers].sort((a, b) => b.calls - a.calls),
    [consumers],
  );

  const consumerItems = React.useMemo(
    () =>
      sortedConsumers
        .slice(0, 8)
        .map((c) => ({ label: c.company_name, value: c.calls })),
    [sortedConsumers],
  );

  const sortedEndpoints = React.useMemo(
    () => [...endpoints].sort((a, b) => b.calls - a.calls),
    [endpoints],
  );

  const endpointItems = React.useMemo(
    () => sortedEndpoints.map((e) => ({ label: e.endpoint, value: e.calls })),
    [sortedEndpoints],
  );

  // Anomalies derived client-side from the fetched window: elevated endpoint
  // error rates plus tenants closing in on their plan quota.
  const anomalyFlags = React.useMemo<AnomalyFlag[]>(() => {
    const flags: AnomalyFlag[] = [];
    for (const e of sortedEndpoints) {
      if (e.calls > 0 && e.success_rate < 0.95) {
        flags.push({
          id: `error-rate-${slugify(e.endpoint)}`,
          severity: e.success_rate < 0.9 ? "critical" : "warning",
          icon: "shield",
          title: `High error rate on ${e.endpoint}`,
          detail: `Success rate ${formatPercent(e.success_rate, 1)} across ${formatNumber(e.calls)} calls in this window — below the 95% platform baseline.`,
        });
      }
    }
    for (const c of sortedConsumers) {
      if (c.quota_pct >= 80) {
        flags.push({
          id: `quota-${c.company_id}`,
          severity: c.quota_pct >= 100 ? "critical" : "warning",
          icon: "trending",
          title: `${c.company_name} approaching quota`,
          detail: `${formatPercent(c.quota_pct / 100, 1)} of the ${c.plan_code} plan quota used this billing cycle.`,
          href: `/admin/users/${c.company_id}`,
          actionLabel: "View tenant",
        });
      }
    }
    return flags;
  }, [sortedEndpoints, sortedConsumers]);

  function handleExportCsv() {
    if (sortedConsumers.length === 0) {
      toast.info("No usage data to export yet.");
      return;
    }
    const header = ["company", "plan", "status", "calls", "pct_of_total", "quota_pct"];
    const lines = [
      header.join(","),
      ...sortedConsumers.map((c) =>
        [
          csvEscape(c.company_name),
          c.plan_code,
          c.company_status,
          c.calls,
          `${c.pct_of_total}%`,
          `${c.quota_pct}%`,
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `postpin-admin-usage-${range}d.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Usage CSV downloaded");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Usage reports"
        description="Platform-wide API consumption across every tenant — volume, latency, top consumers and abuse signals."
      >
        <Select value={range} onValueChange={(v) => setRange(v as RangeValue)}>
          <SelectTrigger
            className="w-[180px]"
            data-testid="usage-reports-range-select"
            aria-label="Date range"
          >
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem
                key={r.value}
                value={r.value}
                data-testid={`usage-reports-range-option-${r.value}`}
              >
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="group"
          onClick={handleExportCsv}
          data-testid="usage-reports-export-csv-btn"
        >
          <Icon name="download" trigger="group-hover" size={16} /> Export CSV
        </Button>
      </PageHeader>

      <QueryBoundary
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
      >
        {/* KPI tiles */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total calls"
            value={summary ? formatCompact(summary.calls) : "—"}
            icon="activity"
            hint={
              summary
                ? `${formatNumber(summary.calls)} requests · ${formatNumber(summary.failed)} failed`
                : undefined
            }
            testId="usage-reports-stat-total-card"
          />
          <StatCard
            label="Avg latency"
            value={summary ? formatLatency(summary.avg_latency_ms) : "—"}
            icon="gauge"
            hint="Mean across all tenants"
            testId="usage-reports-stat-latency-card"
          />
          <StatCard
            label="Blocked %"
            value={summary ? formatPercent(summary.blocked_pct / 100, 2) : "—"}
            icon="shield"
            hint={
              summary
                ? `${formatNumber(summary.blocked)} blocked requests`
                : undefined
            }
            testId="usage-reports-stat-blocked-card"
          />
          <StatCard
            label="p99 latency"
            value={summary ? formatLatency(summary.p99_latency_ms) : "—"}
            icon="trending"
            hint="Tail latency across the window"
            testId="usage-reports-stat-p99-card"
          />
        </div>

        {/* Total volume area chart */}
        <ChartCard
          title="Total API volume"
          description={`Platform-wide calls across all tenants · ${rangeLabel.toLowerCase()}`}
          testId="usage-reports-volume-chart"
        >
          {volumeData.length === 0 ? (
            <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
              No API calls in this window yet.
            </div>
          ) : (
            <AreaTrend
              data={volumeData}
              dataKey="calls"
              xKey="label"
              height={280}
              color="var(--chart-1)"
              valueFormatter={(v) => formatCompact(v)}
            />
          )}
        </ChartCard>

        {/* Top consumers + Top endpoints */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ChartCard
            title="Top consumers"
            description={`Tenants by API calls · ${rangeLabel.toLowerCase()}`}
            testId="usage-reports-top-consumers-bar"
          >
            {consumerItems.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                No data yet
              </div>
            ) : (
              <BarList
                items={consumerItems}
                valueFormatter={(v) => formatCompact(v)}
              />
            )}
          </ChartCard>

          <ChartCard
            title="Top endpoints"
            description="Requests by route across the platform"
            testId="usage-reports-top-endpoints-bar"
          >
            {endpointItems.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                No data yet
              </div>
            ) : (
              <BarList
                items={endpointItems}
                valueFormatter={(v) => formatCompact(v)}
              />
            )}
          </ChartCard>
        </div>

        {/* Anomaly / abuse flags */}
        <Card data-testid="usage-reports-abuse-card">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Icon name="shieldCheck" size={18} className="text-primary" />
                  Anomaly &amp; abuse flags
                </CardTitle>
                <CardDescription>
                  Tenants whose traffic deviates from their plan baseline.
                </CardDescription>
              </div>
              <Badge
                variant={anomalyFlags.length > 0 ? "warning" : "muted"}
                data-testid="usage-reports-abuse-count-badge"
              >
                {anomalyFlags.length} active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {anomalyFlags.length === 0 ? (
              <div
                className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
                data-testid="usage-reports-abuse-empty"
              >
                No anomalies detected in this window.
              </div>
            ) : (
              anomalyFlags.map((flag) => {
                const s = SEVERITY_STYLES[flag.severity];
                return (
                  <div
                    key={flag.id}
                    className={`group flex flex-col gap-3 rounded-xl border ${s.ring} ${s.tint} p-4 sm:flex-row sm:items-center sm:justify-between`}
                    data-testid={`usage-reports-abuse-${flag.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-lg ${s.iconWrap}`}
                      >
                        <Icon name={flag.icon} trigger="group-hover" size={18} />
                      </span>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{flag.title}</p>
                          <Badge variant={s.badge}>{s.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {flag.detail}
                        </p>
                      </div>
                    </div>
                    {flag.href && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="group shrink-0 self-start sm:self-center"
                        asChild
                        data-testid={`usage-reports-abuse-action-${flag.id}`}
                      >
                        <Link href={flag.href}>
                          {flag.actionLabel}
                          <Icon
                            name="arrowRight"
                            trigger="group-hover"
                            size={14}
                          />
                        </Link>
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Top consumers table */}
        <Card
          className="overflow-hidden"
          data-testid="usage-reports-consumers-table-card"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h3 className="font-display text-base font-semibold tracking-tight">
                Top consumers
              </h3>
              <p className="text-sm text-muted-foreground">
                Tenants ranked by share of total platform calls.
              </p>
            </div>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {rangeLabel}
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table data-testid="usage-reports-consumers-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead className="hidden sm:table-cell">Plan</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">% of total</TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    Quota used
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedConsumers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No API calls in this window yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedConsumers.map((c, i) => (
                    <TableRow
                      key={c.company_id}
                      data-testid={`usage-reports-consumer-row-${c.company_id}`}
                    >
                      <TableCell className="text-center tabular-nums text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{c.company_name}</span>
                          <span className="text-xs capitalize text-muted-foreground">
                            {c.company_status}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary" className="capitalize">
                          {c.plan_code}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(c.calls)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatPercent(c.pct_of_total / 100, 1)}
                      </TableCell>
                      <TableCell className="hidden text-right md:table-cell">
                        <div className="flex items-center justify-end gap-2">
                          <span className="tabular-nums text-muted-foreground">
                            {formatPercent(c.quota_pct / 100, 1)}
                          </span>
                          <Progress
                            value={Math.min(100, c.quota_pct)}
                            className="h-1.5 w-20"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Endpoints table */}
        <Card
          className="overflow-hidden"
          data-testid="usage-reports-endpoints-table-card"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h3 className="font-display text-base font-semibold tracking-tight">
                Requests by endpoint
              </h3>
              <p className="text-sm text-muted-foreground">
                Volume, reliability and latency per route across the platform.
              </p>
            </div>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {rangeLabel}
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table data-testid="usage-reports-endpoints-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Success rate</TableHead>
                  <TableHead className="text-right">Avg latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEndpoints.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      No API calls in this window yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedEndpoints.map((e) => {
                    const healthy = e.success_rate >= 0.95;
                    return (
                      <TableRow
                        key={e.endpoint}
                        data-testid={`usage-reports-endpoint-row-${slugify(e.endpoint)}`}
                      >
                        <TableCell className="font-mono text-xs sm:text-sm">
                          {e.endpoint}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(e.calls)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={
                              healthy
                                ? "font-semibold tabular-nums text-success"
                                : "font-semibold tabular-nums text-warning"
                            }
                          >
                            {formatPercent(e.success_rate, 1)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatLatency(e.avg_latency_ms)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </QueryBoundary>
    </div>
  );
}
