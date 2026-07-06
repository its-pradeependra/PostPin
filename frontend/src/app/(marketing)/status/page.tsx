"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Icon, type IconName } from "@/components/icons";
import { StatusDot } from "@/components/shared/status-badge";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { formatDate, formatNumber, formatRelativeTime } from "@/lib/format";
import { getPublicStatus, type ComponentStatus } from "@/lib/api/services/public";
import { site } from "@/lib/site";

type DayStatus = ComponentStatus | "no_data";

const STATUS_META: Record<
  ComponentStatus,
  { tone: "success" | "warning" | "destructive"; label: string }
> = {
  operational: { tone: "success", label: "Operational" },
  degraded: { tone: "warning", label: "Degraded performance" },
  outage: { tone: "destructive", label: "Outage" },
};

const OVERALL_META: Record<
  ComponentStatus,
  { variant: "success" | "warning" | "destructive"; icon: IconName; title: string; description: string }
> = {
  operational: {
    variant: "success",
    icon: "checkCircle",
    title: "All systems operational",
    description: "Every Postpin service is running normally.",
  },
  degraded: {
    variant: "warning",
    icon: "activity",
    title: "Some systems are experiencing issues",
    description: "See the affected components below for details.",
  },
  outage: {
    variant: "destructive",
    icon: "activity",
    title: "Service disruption in progress",
    description: "One or more components are down. See the affected components below.",
  },
};

const DAY_TICK: Record<DayStatus, { className: string; label: string }> = {
  operational: { className: "bg-success", label: "Operational" },
  degraded: { className: "bg-warning", label: "Degraded" },
  outage: { className: "bg-destructive", label: "Outage" },
  no_data: { className: "bg-muted", label: "No traffic" },
};

const COMPONENT_ICONS: Record<string, IconName> = {
  api: "calculator",
  database: "database",
  cache: "zap",
  dashboard: "dashboard",
};

const STATUS_TEXT_CLASS: Record<ComponentStatus, string> = {
  operational: "text-sm font-medium text-success",
  degraded: "text-sm font-medium text-warning",
  outage: "text-sm font-medium text-destructive",
};

export default function StatusPage() {
  const q = useQuery({
    queryKey: ["public", "status"],
    queryFn: getPublicStatus,
    refetchInterval: 60_000,
  });
  const status = q.data;
  const overallMeta = status ? OVERALL_META[status.overall] : null;

  const metrics = status
    ? [
        { id: "uptime-90d", label: "Uptime — last 90 days", value: `${status.uptime_90d_pct.toFixed(2)}%` },
        { id: "latency-24h", label: "Avg latency — last 24 h", value: `${formatNumber(status.avg_latency_24h_ms)} ms` },
        { id: "requests-24h", label: "Requests — last 24 h", value: formatNumber(status.requests_24h) },
      ]
    : [];

  return (
    <div data-testid="status-page">
      {/* ── Header ── */}
      <section className="border-b border-border bg-card/40">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-16">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                {site.name} status
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                System status
              </h1>
            </div>
            <Link
              href="/docs"
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              data-testid="status-docs-link"
            >
              <Icon name="book" size={16} />
              API documentation
            </Link>
          </div>

          {/* Overall banner */}
          {status && overallMeta ? (
            <Alert variant={overallMeta.variant} className="mt-8" data-testid="status-overall-banner">
              <Icon name={overallMeta.icon} size={18} />
              <AlertTitle>{overallMeta.title}</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{overallMeta.description}</span>
                <span className="text-muted-foreground">
                  Updated {formatRelativeTime(status.updated_at)}
                </span>
              </AlertDescription>
            </Alert>
          ) : q.isError ? (
            <Alert variant="warning" className="mt-8" data-testid="status-overall-banner">
              <Icon name="activity" size={18} />
              <AlertTitle>Live status unavailable</AlertTitle>
              <AlertDescription>
                We couldn&apos;t reach the status service. Retrying automatically.
              </AlertDescription>
            </Alert>
          ) : (
            <div
              className="mt-8 h-[74px] animate-pulse rounded-xl bg-muted"
              data-testid="status-banner-skeleton"
            />
          )}

          {/* Live metrics strip */}
          {(status || !q.isError) && (
            <div
              className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3"
              data-testid="status-uptime-windows"
            >
              {status
                ? metrics.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-xl border border-border bg-background p-4"
                      data-testid={`status-metric-${m.id}`}
                    >
                      <p className="font-display text-2xl font-bold tabular-nums text-gradient">
                        {m.value}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{m.label}</p>
                    </div>
                  ))
                : [0, 1, 2].map((i) => (
                    <div key={i} className="h-[84px] animate-pulse rounded-xl border border-border bg-muted" />
                  ))}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-12 px-4 py-12 sm:px-6">
        {/* ── Components & 90-day uptime ── */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold tracking-tight">Components</h2>
            <span className="text-xs text-muted-foreground">Live component health</span>
          </div>

          <div className="mt-4">
            <QueryBoundary
              isLoading={q.isLoading}
              error={status ? undefined : q.error}
              onRetry={() => q.refetch()}
              skeleton={
                <Card className="divide-y divide-border p-0">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="p-5 sm:p-6">
                      <div className="h-9 animate-pulse rounded-xl bg-muted" />
                    </div>
                  ))}
                </Card>
              }
            >
              {status && (
                <>
                  <Card className="divide-y divide-border p-0" data-testid="status-components-list">
                    {status.components.map((c) => {
                      const meta = STATUS_META[c.status];
                      return (
                        <div
                          key={c.id}
                          className="group flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6"
                          data-testid={`status-component-${c.id}`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                              <Icon
                                name={COMPONENT_ICONS[c.id] ?? "activity"}
                                size={18}
                              />
                            </span>
                            <div className="min-w-0">
                              <p className="font-display text-sm font-semibold">{c.name}</p>
                              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                                {c.uptime_pct.toFixed(2)}% uptime
                              </p>
                            </div>
                          </div>
                          <div
                            className="flex items-center gap-2"
                            data-testid={`status-component-${c.id}-status`}
                          >
                            <StatusDot tone={meta.tone} />
                            <span className={STATUS_TEXT_CLASS[c.status]}>{meta.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </Card>

                  {/* Platform-wide 90-day uptime tick strip */}
                  <Card className="mt-4 p-5 sm:p-6">
                    <div className="flex items-center justify-between">
                      <p className="font-display text-sm font-semibold">Platform uptime</p>
                      <span className="text-xs text-muted-foreground">Last 90 days</span>
                    </div>
                    <div
                      className="mt-3 flex items-end gap-[2px]"
                      data-testid="status-uptime-strip"
                      role="img"
                      aria-label={`Platform uptime over the last 90 days: ${status.uptime_90d_pct}%`}
                    >
                      {status.history.map((d) => (
                        <span
                          key={d.date}
                          title={`${formatDate(d.date)} · ${DAY_TICK[d.status].label}`}
                          className={`h-7 flex-1 rounded-[2px] ${DAY_TICK[d.status].className} ${
                            d.status === "no_data" ? "opacity-50" : "opacity-80"
                          } transition-opacity hover:opacity-100`}
                        />
                      ))}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>90 days ago</span>
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {status.uptime_90d_pct.toFixed(2)}% uptime
                      </span>
                      <span>Today</span>
                    </div>
                  </Card>

                  {/* Legend */}
                  <div
                    className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"
                    data-testid="status-legend"
                  >
                    {(Object.keys(DAY_TICK) as DayStatus[]).map((s) => (
                      <span key={s} className="flex items-center gap-1.5">
                        <span className={`size-2.5 rounded-[2px] ${DAY_TICK[s].className}`} />
                        {DAY_TICK[s].label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </QueryBoundary>
          </div>
        </section>

        <Separator />

        {/* ── Incident history ── */}
        <section data-testid="status-incidents-section">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold tracking-tight">Past incidents</h2>
            <span className="text-xs text-muted-foreground">Last 90 days</span>
          </div>

          <Card
            className="mt-4 flex flex-col items-center gap-2 p-10 text-center"
            data-testid="status-incidents-empty"
          >
            <span className="grid size-11 place-items-center rounded-full bg-success/12 text-success">
              <Icon name="shieldCheck" size={22} />
            </span>
            <p className="font-display text-sm font-semibold">No incidents reported</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              No incidents reported in the last 90 days.
            </p>
          </Card>
        </section>

        {/* ── Subscribe / footer note ── */}
        <Card className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <p className="font-display text-sm font-semibold">Get status updates</p>
            <p className="text-sm text-muted-foreground">
              Subscribe to incident notifications or check our SLA in the docs.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/contact"
              className="group inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:border-primary/40"
              data-testid="status-subscribe-link"
            >
              <Icon name="mail" size={15} />
              Subscribe to updates
            </Link>
            <Link
              href="/legal/terms#sla"
              className="group inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-gradient px-3 text-sm font-medium text-white shadow-glow"
              data-testid="status-sla-link"
            >
              <Icon name="shieldCheck" size={15} className="text-white" />
              View SLA
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
