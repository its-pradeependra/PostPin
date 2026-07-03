"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ChartCard, BarTrend, AreaTrend, Sparkline } from "@/components/shared/charts";
import { Icon, type IconName } from "@/components/icons";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { getAdminOverview, type AdminActivityRow, type AdminMetric } from "@/lib/api/services/admin";
import { formatCompact, formatCurrency, formatNumber, formatRelativeTime } from "@/lib/format";

/* ── Presentation helpers ─────────────────────────────────────────── */

// Sparkline tint cycles through the brand chart palette.
const sparkColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-1)",
];

function metricValue(m: AdminMetric) {
  if (m.format === "currency") return formatCurrency(m.value);
  if (m.format === "compact") return formatCompact(m.value);
  return formatNumber(m.value);
}

const severityStyles: Record<
  "critical" | "warning" | "info",
  { wrap: string; icon: string; badge: "destructive" | "warning" | "info"; label: string }
> = {
  critical: {
    wrap: "border-destructive/30 bg-destructive/5",
    icon: "text-destructive bg-destructive/12",
    badge: "destructive",
    label: "Critical",
  },
  warning: {
    wrap: "border-warning/30 bg-warning/5",
    icon: "text-warning bg-warning/12",
    badge: "warning",
    label: "Warning",
  },
  info: {
    wrap: "border-info/30 bg-info/5",
    icon: "text-info bg-info/12",
    badge: "info",
    label: "Info",
  },
};

function severityTone(s: AdminActivityRow["severity"]) {
  if (s === "critical") return "destructive" as const;
  if (s === "warning") return "warning" as const;
  return "muted" as const;
}

const dayFormatter = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" });

export default function AdminDashboardPage() {
  const q = useQuery({ queryKey: ["admin", "overview"], queryFn: getAdminOverview });
  const overview = q.data;

  // API volume — real platform-wide series, x-axis formatted as day labels.
  const apiVolumeData = useMemo(
    () =>
      (overview?.api_volume ?? []).map((p) => ({
        month: dayFormatter.format(new Date(p.date)),
        calls: p.calls,
      })),
    [overview],
  );
  const apiVolumeTotal = useMemo(
    () => apiVolumeData.reduce((sum, p) => sum + p.calls, 0),
    [apiVolumeData],
  );

  return (
    <div className="space-y-6" data-testid="admin-dashboard-page">
      <PageHeader
        title="Platform overview"
        eyebrow="Overview"
        description="Health, revenue and the few things that need an operator's attention right now."
      >
        <Button variant="outline" asChild className="group" data-testid="admin-overview-usage-btn">
          <Link href="/admin/usage-reports">
            <Icon name="analytics" trigger="group-hover" size={16} />
            Usage reports
          </Link>
        </Button>
        <Button variant="gradient" asChild className="group" data-testid="admin-overview-pincodes-btn">
          <Link href="/admin/pincodes">
            <Icon name="sync" trigger="group-hover" size={16} className="text-white" />
            Pincode master
          </Link>
        </Button>
      </PageHeader>

      <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
        {overview && (
          <div className="space-y-6">
            {/* ── KPI grid (metrics, each with a sparkline) ─────────── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {overview.metrics.map((m, i) => (
                <div key={m.key} className="relative" data-testid={`admin-kpi-${i}`}>
                  <StatCard
                    label={m.label}
                    value={metricValue(m)}
                    icon={m.icon as IconName}
                    deltaPct={m.delta_pct}
                    testId={`admin-stat-${m.label.toLowerCase().replace(/[^a-z]+/g, "-")}-card`}
                  />
                  <div
                    className="pointer-events-none absolute inset-x-5 bottom-4 opacity-70"
                    aria-hidden
                  >
                    <Sparkline data={m.spark} color={sparkColors[i % sparkColors.length]} height={28} />
                  </div>
                </div>
              ))}
            </div>

            {/* ── Revenue + API volume charts ─────────────────────────── */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard
                title="Monthly recurring revenue"
                description="MRR across all tenants over the last 12 months."
                testId="admin-mrr-chart"
                action={
                  <Badge variant="success" className="shrink-0" data-testid="admin-mrr-30d-badge">
                    <Icon name="trending" size={12} />
                    {formatCompact(overview.revenue_30d)} collected · 30d
                  </Badge>
                }
              >
                <BarTrend
                  data={overview.revenue_series}
                  dataKey="mrr"
                  xKey="month"
                  height={260}
                  color="var(--chart-1)"
                  valueFormatter={(v) => formatCurrency(v, "INR", { notation: "compact", maximumFractionDigits: 1 })}
                />
              </ChartCard>

              <ChartCard
                title="API volume"
                description="Platform-wide rate-calculation requests, last 30 days."
                testId="admin-api-volume-chart"
                action={
                  <Badge variant="gradient" className="shrink-0" data-testid="admin-api-volume-total-badge">
                    <Icon name="activity" size={12} className="text-white" />
                    {formatCompact(apiVolumeTotal)}
                  </Badge>
                }
              >
                <AreaTrend
                  data={apiVolumeData}
                  dataKey="calls"
                  xKey="month"
                  height={260}
                  color="var(--chart-2)"
                  valueFormatter={(v) => formatCompact(v)}
                />
              </ChartCard>
            </div>

            {/* ── Sync health + Alerts ────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Sync health */}
              <Card className="flex flex-col p-5" data-testid="admin-sync-health-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                      <Icon name="database" size={20} />
                    </span>
                    <div>
                      <h3 className="font-display text-base font-semibold tracking-tight">Sync health</h3>
                      <p className="text-sm text-muted-foreground">Pincode master data sync.</p>
                    </div>
                  </div>
                  <StatusBadge status={overview.sync.status} testId="admin-sync-status-badge" />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-muted/50 p-3" data-testid="admin-sync-total">
                    <p className="text-xs text-muted-foreground">Total pincodes</p>
                    <p className="mt-0.5 font-display text-xl font-bold tabular-nums">
                      {formatNumber(overview.sync.total)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3" data-testid="admin-sync-last">
                    <p className="text-xs text-muted-foreground">Last sync</p>
                    <p className="mt-0.5 font-display text-xl font-bold tabular-nums">
                      {overview.sync.last_sync_at
                        ? formatRelativeTime(overview.sync.last_sync_at)
                        : "Never"}
                    </p>
                  </div>
                  <div className="col-span-2 rounded-xl bg-muted/50 p-3" data-testid="admin-sync-changes">
                    <p className="text-xs text-muted-foreground">Today&apos;s diff</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-sm font-medium tabular-nums">
                      <span className="text-success">+{overview.sync.added_today}</span>
                      <span className="text-info">~{overview.sync.updated_today}</span>
                      <span className="text-destructive">−{overview.sync.removed_today}</span>
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-xs text-muted-foreground" data-testid="admin-sync-source-line">
                  Source <span className="font-mono text-foreground">{overview.sync.source}</span> ·{" "}
                  {overview.sync.schedule === "manual" ? (
                    "Manual import"
                  ) : (
                    <span className="font-mono text-foreground">{overview.sync.schedule}</span>
                  )}
                </p>

                <CardFooter className="mt-auto px-0 pb-0 pt-5">
                  <Button
                    variant="outline"
                    asChild
                    className="group w-full"
                    data-testid="admin-sync-pincode-master-btn"
                  >
                    <Link href="/admin/pincodes">
                      <Icon name="pin" trigger="group-hover" size={16} />
                      Go to Pincode Master
                      <Icon name="arrowRight" trigger="group-hover" size={14} className="ml-auto" />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>

              {/* Alerts */}
              <Card className="flex flex-col p-5" data-testid="admin-alerts-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-semibold tracking-tight">Alerts</h3>
                    <p className="text-sm text-muted-foreground">Things that page an operator.</p>
                  </div>
                  <Badge
                    variant={overview.alerts.length > 0 ? "destructive" : "success"}
                    data-testid="admin-alerts-count-badge"
                  >
                    {overview.alerts.length}
                  </Badge>
                </div>

                {overview.alerts.length === 0 ? (
                  <div
                    className="mt-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-success/30 bg-success/5 p-6 text-center"
                    data-testid="admin-alerts-empty"
                  >
                    <span className="grid size-10 place-items-center rounded-full bg-success/12 text-success">
                      <Icon name="checkCircle" size={20} />
                    </span>
                    <p className="text-sm font-medium">
                      All clear — nothing needs an operator right now.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {overview.alerts.map((a) => {
                      const s = severityStyles[a.severity];
                      return (
                        <Link
                          key={a.id}
                          href={a.href}
                          data-testid={`admin-alert-${a.id}`}
                          className={`group flex items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/40 ${s.wrap}`}
                        >
                          <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${s.icon}`}>
                            <Icon name={a.icon as IconName} trigger="group-hover" size={18} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold">{a.title}</p>
                              <Badge variant={s.badge} className="ml-auto shrink-0">
                                {s.label}
                              </Badge>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.meta}</p>
                            <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary">
                              {a.action}
                              <Icon name="arrowRight" trigger="group-hover" size={12} />
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>

            {/* ── Recent admin activity ───────────────────────────────── */}
            <Card data-testid="admin-activity-card">
              <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="flex items-center gap-2">
                    <Icon name="audit" size={18} className="text-primary" />
                    Recent admin activity
                  </CardTitle>
                  <CardDescription>The latest events from the platform audit log.</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="group shrink-0"
                  data-testid="admin-activity-view-all-btn"
                >
                  <Link href="/admin/audit-logs">
                    View audit log
                    <Icon name="arrowRight" trigger="group-hover" size={14} />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="pt-0">
                {overview.activity.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground" data-testid="admin-activity-empty">
                    No admin activity recorded yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border" data-testid="admin-activity-list">
                    {overview.activity.map((log) => (
                      <li
                        key={log.id}
                        data-testid={`admin-activity-row-${log.id}`}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <span
                          className={`size-2 shrink-0 rounded-full ${
                            log.severity === "critical"
                              ? "bg-destructive"
                              : log.severity === "warning"
                                ? "bg-warning"
                                : "bg-muted-foreground"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">
                            <span className="font-medium">{log.actor}</span>{" "}
                            <span className="font-mono text-xs text-muted-foreground">{log.action}</span>
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{log.target}</p>
                        </div>
                        <Separator orientation="vertical" className="hidden h-8 sm:block" />
                        <div className="hidden shrink-0 text-right sm:block">
                          <StatusBadge status={log.actor_role} className="capitalize" />
                        </div>
                        <Badge
                          variant={severityTone(log.severity)}
                          className="hidden shrink-0 capitalize md:inline-flex"
                        >
                          {log.severity}
                        </Badge>
                        <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                          {formatRelativeTime(log.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
