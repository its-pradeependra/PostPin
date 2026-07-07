"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { CodeBlock } from "@/components/shared/code-block";
import { ChartCard, AreaTrend } from "@/components/shared/charts";
import { EmptyState } from "@/components/shared/empty-state";
import { Icon } from "@/components/icons";
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
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

import { useSession } from "@/components/providers/session-provider";
import { getUsageLogs, getUsageSeries, getUsageSummary } from "@/lib/api/services/usage";
import { getSubscription } from "@/lib/api/services/subscription";
import { site } from "@/lib/site";
import {
  formatCompact,
  formatNumber,
  formatPercent,
  formatLatency,
  formatDate,
  formatRelativeTime,
} from "@/lib/format";

function statusVariant(code: number) {
  if (code < 300) return "success" as const;
  if (code === 429) return "warning" as const;
  if (code < 500) return "info" as const;
  return "destructive" as const;
}

const curlSnippet = `curl -X POST ${site.apiBase}/rates/calculate \\
  -H "Authorization: Bearer pp_live_••••••••••••••••8f3a" \\
  -H "Content-Type: application/json" \\
  -d '{
    "origin": "400001",
    "destination": "110001",
    "weight": 1200,
    "service": "express",
    "cod": true,
    "declared_value": 2500
  }'`;

export default function DashboardPage() {
  const { user } = useSession();
  const summaryQ = useQuery({ queryKey: ["usage", "summary"], queryFn: () => getUsageSummary(30) });
  const seriesQ = useQuery({ queryKey: ["usage", "series"], queryFn: () => getUsageSeries(30) });
  const logsQ = useQuery({ queryKey: ["usage", "logs", 10], queryFn: () => getUsageLogs(10) });
  const subQ = useQuery({ queryKey: ["subscription"], queryFn: getSubscription });

  const summary = summaryQ.data;
  const sub = subQ.data;
  const unlimited = sub?.usage.included_calls === -1;
  const quotaUsed = sub?.usage.calls_used ?? 0;
  const quotaTotal = sub?.usage.included_calls ?? 0;
  const quotaPct = unlimited || quotaTotal <= 0 ? 0 : Math.min(100, Math.round((quotaUsed / quotaTotal) * 100));
  const quotaWarning = !unlimited && quotaPct >= 80;
  const callsData = (seriesQ.data ?? []).map((p) => ({ label: formatDate(p.date, "short"), calls: p.calls }));
  const logs = logsQ.data ?? [];
  const firstName = user?.name?.split(" ")[0] ?? "there";
  const planName = sub?.plan.name ?? "—";

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <PageHeader
        title="Dashboard"
        eyebrow="Overview"
        description={`Welcome back, ${firstName} — here's how your Postpin integration is doing.`}
      >
        <Button variant="outline" asChild className="group" data-testid="dashboard-playground-btn">
          <Link href="/app/playground">
            <Icon name="calculator" size={16} />
            Open playground
          </Link>
        </Button>
        <Button variant="gradient" asChild className="group" data-testid="dashboard-create-key-btn">
          <Link href="/app/keys">
            <Icon name="plus" size={16} className="text-white" />
            Create API key
          </Link>
        </Button>
      </PageHeader>

      {quotaWarning && (
        <Alert variant="warning" data-testid="dashboard-quota-alert">
          <Icon name="gauge" size={16} />
          <AlertTitle>You&apos;ve used {quotaPct}% of your monthly quota</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {formatNumber(quotaUsed)} of {formatNumber(quotaTotal)} rate calls used this cycle. Upgrade to avoid
              being blocked at 100%.
            </span>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="group shrink-0 border-warning/40 bg-warning/10 text-warning hover:bg-warning/20 hover:text-warning"
              data-testid="dashboard-quota-billing-btn"
            >
              <Link href="/app/billing">
                View billing
                <Icon name="arrowRight" size={14} />
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Calls (30d)"
          value={summary ? formatCompact(summary.calls) : "—"}
          icon="activity"
          hint={summary ? `${formatNumber(summary.calls)} total requests` : "Loading…"}
          testId="dashboard-stat-calls-card"
        />
        <StatCard
          label="Success rate"
          value={summary ? formatPercent(summary.success_rate, 1) : "—"}
          icon="checkCircle"
          hint="2xx responses"
          testId="dashboard-stat-success-card"
        />
        <StatCard
          label="Avg latency"
          value={summary ? formatLatency(summary.avg_latency_ms) : "—"}
          icon="gauge"
          hint="engine time"
          testId="dashboard-stat-latency-card"
        />
        <StatCard
          label="Active keys"
          value={summary ? String(summary.active_keys) : "—"}
          icon="keys"
          hint="usable now"
          testId="dashboard-stat-keys-card"
        />
      </div>

      {/* Chart + quota */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          title="API calls"
          description="Daily rate-calculation requests over the last 30 days."
          className="lg:col-span-2"
          testId="dashboard-calls-chart"
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

        <Card className="flex flex-col p-5" data-testid="dashboard-quota-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold tracking-tight">Monthly quota</h3>
              <p className="text-sm text-muted-foreground">Resets at the start of each cycle.</p>
            </div>
            <Badge variant="gradient" className="shrink-0" data-testid="dashboard-plan-badge">
              <Icon name="rocket" size={12} className="text-white" />
              {planName}
            </Badge>
          </div>

          <div className="mt-6 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-2xl font-bold tabular-nums">{formatNumber(quotaUsed)}</span>
              <span className="font-mono text-sm text-muted-foreground tabular-nums">
                / {unlimited ? "∞" : formatNumber(quotaTotal)}
              </span>
            </div>
            <Progress
              value={quotaPct}
              data-testid="dashboard-quota-progress"
              indicatorClassName={quotaWarning ? "bg-warning" : undefined}
            />
            <div className="flex items-center justify-between text-xs">
              <span className={quotaWarning ? "font-semibold text-warning" : "text-muted-foreground"}>
                {unlimited ? "Unlimited" : `${quotaPct}% used`}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {unlimited ? "no cap" : `${formatNumber(Math.max(0, quotaTotal - quotaUsed))} left`}
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-xl bg-muted/50 p-3 text-sm">
            <p className="font-medium">{planName} plan</p>
            <p className="text-xs text-muted-foreground">
              {sub ? `${unlimited ? "Unlimited" : formatNumber(sub.plan.included_calls)} calls / mo` : "Loading…"}
              {sub?.plan.rate_limit_rpm ? ` · ${sub.plan.rate_limit_rpm} RPM` : ""}
            </p>
          </div>

          <div className="mt-auto pt-6">
            <Button variant="gradient" className="group w-full" asChild data-testid="dashboard-upgrade-btn">
              <Link href="/app/billing">
                <Icon name="zap" size={16} className="text-white" />
                Upgrade plan
              </Link>
            </Button>
          </div>
        </Card>
      </div>

      {/* Recent calls */}
      <Card data-testid="dashboard-recent-calls-card">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Recent calls</CardTitle>
            <CardDescription>The latest API requests across all of your keys.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild className="group shrink-0" data-testid="dashboard-view-usage-btn">
            <Link href="/app/usage">
              View all
              <Icon name="arrowRight" size={14} />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {logs.length === 0 ? (
            <div className="px-6 pb-4">
              <EmptyState
                icon="activity"
                title={logsQ.isLoading ? "Loading recent calls…" : "No API calls yet"}
                description="Create a key and make your first request to see it here."
                testId="dashboard-recent-empty"
              />
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-6">Endpoint</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Latency</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead className="pr-6 text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((call) => (
                      <TableRow key={call.id} data-testid={`dashboard-call-row-${call.id}`}>
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-2">
                            <Badge variant="muted" className="font-mono">
                              {call.method}
                            </Badge>
                            <span className="font-mono text-xs text-foreground">{call.endpoint}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(call.status)} className="font-mono tabular-nums">
                            {call.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {formatLatency(call.latency_ms)}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate font-mono text-xs text-muted-foreground">
                          {call.key_prefix ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {call.detail?.origin ? (
                            <span className="inline-flex items-center gap-1">
                              {call.detail.origin}
                              <Icon name="arrowRight" size={12} className="text-muted-foreground" />
                              {call.detail.destination}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-6 text-right text-xs text-muted-foreground">
                          {formatRelativeTime(call.at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 px-4 pb-2 md:hidden">
                {logs.map((call) => (
                  <div
                    key={call.id}
                    data-testid={`dashboard-call-card-${call.id}`}
                    className="rounded-xl border border-border p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="muted" className="font-mono">
                          {call.method}
                        </Badge>
                        <span className="font-mono text-xs">{call.endpoint}</span>
                      </div>
                      <Badge variant={statusVariant(call.status)} className="font-mono tabular-nums">
                        {call.status}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between font-mono text-xs tabular-nums text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {call.detail?.origin ?? "—"}
                        {call.detail?.destination && (
                          <>
                            <Icon name="arrowRight" size={12} />
                            {call.detail.destination}
                          </>
                        )}
                      </span>
                      <span>{formatLatency(call.latency_ms)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate font-mono">{call.key_prefix ?? "—"}</span>
                      <span className="shrink-0">{formatRelativeTime(call.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Quick start */}
      <Card data-testid="dashboard-quickstart-card">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Icon name="terminal" size={18} className="text-primary" />
              Quick start
            </CardTitle>
            <CardDescription>Calculate a shipping rate between two Indian pincodes in one request.</CardDescription>
          </div>
          <StatusBadge status="active" testId="dashboard-api-status-badge" />
        </CardHeader>
        <CardContent>
          <CodeBlock code={curlSnippet} language="bash" filename="calculate-rate.sh" testId="dashboard-quickstart-code" />
        </CardContent>
        <CardFooter className="gap-2">
          <Button variant="outline" size="sm" asChild className="group" data-testid="dashboard-docs-btn">
            <Link href="/docs">
              <Icon name="book" size={14} />
              Read the docs
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild className="group" data-testid="dashboard-try-playground-btn">
            <Link href="/app/playground">
              Try it in the playground
              <Icon name="arrowRight" size={14} />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
