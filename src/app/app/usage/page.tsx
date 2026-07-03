"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ChartCard, AreaTrend, BarTrend, BarList, StatusDonut } from "@/components/shared/charts";
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
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icons";
import {
  getUsageByEndpoint,
  getUsageByStatus,
  getUsageSeries,
  getUsageSummary,
} from "@/lib/api/services/usage";
import { formatCompact, formatNumber, formatPercent, formatLatency, formatDate } from "@/lib/format";

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;

type RangeValue = (typeof RANGES)[number]["value"];

export default function UsageAnalyticsPage() {
  const [range, setRange] = React.useState<RangeValue>("30");
  const days = Number(range);

  const summaryQ = useQuery({ queryKey: ["usage", "summary", days], queryFn: () => getUsageSummary(days) });
  const seriesQ = useQuery({ queryKey: ["usage", "series", days], queryFn: () => getUsageSeries(days) });
  const endpointsQ = useQuery({ queryKey: ["usage", "endpoints", days], queryFn: () => getUsageByEndpoint(days) });
  const statusQ = useQuery({ queryKey: ["usage", "status", days], queryFn: () => getUsageByStatus(days) });

  const summary = summaryQ.data;
  const series = seriesQ.data ?? [];
  const endpoints = endpointsQ.data ?? [];
  const statusBreakdown = statusQ.data ?? [];

  const calls = summary?.calls ?? 0;
  const successRate = summary?.success_rate ?? 0;
  const success = Math.round(calls * successRate);
  const failed = Math.max(0, calls - success);

  const callsData = series.map((p) => ({ label: formatDate(p.date, "short"), calls: p.calls }));
  const latencyData = series.map((p) => ({ label: formatDate(p.date, "short"), latency: p.avg_latency_ms }));
  const endpointItems = endpoints.map((e) => ({ label: e.endpoint, value: e.calls }));

  const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? `Last ${days} days`;

  function handleExportCsv() {
    if (endpoints.length === 0) {
      toast.info("No usage data to export yet.");
      return;
    }
    const header = ["endpoint", "calls", "success_rate", "avg_latency_ms"];
    const lines = [
      header.join(","),
      ...endpoints.map((e) =>
        [e.endpoint, e.calls, (e.success_rate * 100).toFixed(1) + "%", e.avg_latency_ms].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `postpin-usage-${range}d.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Usage CSV downloaded");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Usage analytics"
        description="Traffic, success mix, latency and top endpoints across your selected window."
      >
        <Select value={range} onValueChange={(v) => setRange(v as RangeValue)}>
          <SelectTrigger className="w-[180px]" data-testid="usage-range-select" aria-label="Date range">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={r.value} data-testid={`usage-range-option-${r.value}`}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" className="group" onClick={handleExportCsv} data-testid="usage-export-csv-btn">
          <Icon name="download" trigger="group-hover" size={16} /> Export CSV
        </Button>
      </PageHeader>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total calls"
          value={summary ? formatCompact(calls) : "—"}
          icon="activity"
          hint={`${formatNumber(calls)} requests`}
          testId="usage-stat-total-card"
        />
        <StatCard
          label="Success rate"
          value={summary ? formatPercent(successRate, 2) : "—"}
          icon="checkCircle"
          hint={`${formatNumber(success)} succeeded`}
          testId="usage-stat-success-card"
        />
        <StatCard
          label="Failed"
          value={summary ? formatCompact(failed) : "—"}
          icon="shield"
          hint={`${formatNumber(failed)} non-2xx`}
          testId="usage-stat-blocked-card"
        />
        <StatCard
          label="Avg latency"
          value={summary ? formatLatency(summary.avg_latency_ms) : "—"}
          icon="gauge"
          hint="engine time"
          testId="usage-stat-latency-card"
        />
      </div>

      {/* Calls over time + status breakdown */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ChartCard
          title="Calls over time"
          description={`Requests · ${rangeLabel.toLowerCase()}`}
          className="lg:col-span-2"
          testId="usage-calls-area-chart"
        >
          <AreaTrend
            data={callsData}
            dataKey="calls"
            xKey="label"
            height={260}
            color="var(--chart-1)"
            valueFormatter={(v) => formatCompact(v)}
          />
        </ChartCard>

        <ChartCard title="Status breakdown" description="Response status mix" testId="usage-status-donut">
          {statusBreakdown.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No requests yet
            </div>
          ) : (
            <>
              <StatusDonut data={statusBreakdown} height={200} />
              <ul className="mt-4 space-y-2">
                {statusBreakdown.map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center justify-between gap-3 text-sm"
                    data-testid={`usage-status-legend-${s.label.split(" ")[0]}`}
                  >
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                      {s.label}
                    </span>
                    <span className="font-semibold tabular-nums">{formatPercent(s.value / 100, 1)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ChartCard>
      </div>

      {/* Top endpoints + latency */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard title="Top endpoints" description="Requests by endpoint" testId="usage-top-endpoints-bar">
          {endpointItems.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data yet</div>
          ) : (
            <BarList items={endpointItems} valueFormatter={(v) => formatCompact(v)} />
          )}
        </ChartCard>

        <ChartCard title="Latency" description={`Average response time · ${rangeLabel.toLowerCase()}`} testId="usage-latency-chart">
          <BarTrend
            data={latencyData}
            dataKey="latency"
            xKey="label"
            height={260}
            color="var(--chart-2)"
            valueFormatter={(v) => `${Math.round(v)}ms`}
          />
        </ChartCard>
      </div>

      {/* Requests by endpoint table */}
      <Card className="overflow-hidden" data-testid="usage-endpoints-table-card">
        <div className="flex items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h3 className="font-display text-base font-semibold tracking-tight">Requests by endpoint</h3>
            <p className="text-sm text-muted-foreground">Volume, reliability and latency per route.</p>
          </div>
          <span className="hidden text-xs text-muted-foreground sm:inline">{rangeLabel}</span>
        </div>
        <div className="overflow-x-auto">
          <Table data-testid="usage-endpoints-table">
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Success rate</TableHead>
                <TableHead className="text-right">Avg latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    {endpointsQ.isLoading ? "Loading…" : "No API calls in this window yet."}
                  </TableCell>
                </TableRow>
              ) : (
                endpoints.map((e) => {
                  const id = e.endpoint.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                  const healthy = e.success_rate >= 0.99;
                  return (
                    <TableRow key={e.endpoint} data-testid={`usage-endpoint-row-${id}`}>
                      <TableCell className="font-mono text-xs sm:text-sm">{e.endpoint}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(e.calls)}</TableCell>
                      <TableCell className="text-right">
                        <span className={healthy ? "font-semibold tabular-nums text-success" : "font-semibold tabular-nums text-warning"}>
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
    </div>
  );
}
