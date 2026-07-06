"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Icon } from "@/components/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { listSyncLogs, type SyncLogRow } from "@/lib/api/services/admin";
import {
  formatDateTime,
  formatLatency,
  formatNumber,
  formatRelativeTime,
} from "@/lib/format";

type StatusFilter = "all" | SyncLogRow["status"];

type TriggerMeta = {
  label: string;
  variant: NonNullable<BadgeProps["variant"]>;
};

const TRIGGER_META: Record<string, TriggerMeta> = {
  scheduled: { label: "Scheduled", variant: "info" },
  manual: { label: "Manual", variant: "gradient" },
  webhook: { label: "Webhook", variant: "secondary" },
  import: { label: "CSV import", variant: "gradient" },
};

function triggerMeta(trigger: string): TriggerMeta {
  return (
    TRIGGER_META[trigger] ?? {
      label: trigger.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      variant: "secondary",
    }
  );
}

export default function SyncLogsPage() {
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const logsQ = useQuery({
    queryKey: ["admin", "pincodes", "sync-logs"],
    queryFn: () => listSyncLogs(25),
  });
  const logs = logsQ.data ?? [];

  const filtered = React.useMemo(() => {
    if (statusFilter === "all") return logs;
    return logs.filter((r) => r.status === statusFilter);
  }, [logs, statusFilter]);

  const activeRun = React.useMemo(
    () => logs.find((r) => r.id === activeId) ?? null,
    [logs, activeId],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Sync logs"
        description="Forensic history of every pincode sync run — CSV imports and any scheduled or manual refreshes."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger
              className="h-9 w-[170px]"
              data-testid="sync-logs-status-filter"
            >
              <span className="flex items-center gap-2">
                <Icon name="filter" size={14} className="text-muted-foreground" />
                <SelectValue placeholder="All statuses" />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="sync-logs-status-all">
                All statuses
              </SelectItem>
              <SelectItem value="running" data-testid="sync-logs-status-running">
                Running
              </SelectItem>
              <SelectItem value="success" data-testid="sync-logs-status-success">
                Success
              </SelectItem>
              <SelectItem value="failed" data-testid="sync-logs-status-failed">
                Failed
              </SelectItem>
              <SelectItem value="rolled_back" data-testid="sync-logs-status-rolled_back">
                Rolled back
              </SelectItem>
            </SelectContent>
          </Select>

          <Button variant="gradient" size="sm" asChild data-testid="sync-logs-run-sync-link">
            <Link href="/admin/pincodes" className="group">
              <Icon name="upload" trigger="group-hover" size={16} className="text-white" />
              Import CSV
            </Link>
          </Button>
        </div>
      </PageHeader>

      <QueryBoundary
        isLoading={logsQ.isLoading}
        error={logsQ.error}
        onRetry={() => void logsQ.refetch()}
      >
        {filtered.length === 0 ? (
          <EmptyState
            icon="sync"
            title={
              logs.length === 0 ? "No sync runs yet" : "No sync runs match this filter"
            }
            description={
              logs.length === 0
                ? "Import a pincode CSV from the Pincode Master page to record the first run."
                : "Try a different status, or clear the filter to see every run."
            }
            testId="sync-logs-empty"
          >
            {logs.length === 0 ? (
              <Button variant="outline" size="sm" asChild data-testid="sync-logs-empty-import-link">
                <Link href="/admin/pincodes">
                  <Icon name="upload" size={14} /> Import CSV
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStatusFilter("all")}
                data-testid="sync-logs-clear-filter-btn"
              >
                <Icon name="filter" size={14} /> Clear filter
              </Button>
            )}
          </EmptyState>
        ) : (
          <>
            {/* Desktop / tablet table */}
            <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card md:block">
              <Table data-testid="sync-logs-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead className="hidden lg:table-cell">Source</TableHead>
                    <TableHead className="text-right">Scanned</TableHead>
                    <TableHead className="text-right">Added</TableHead>
                    <TableHead className="text-right">Updated</TableHead>
                    <TableHead className="text-right">Removed</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="hidden xl:table-cell">Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((run) => {
                    const trig = triggerMeta(run.trigger);
                    return (
                      <TableRow
                        key={run.id}
                        className="group cursor-pointer"
                        onClick={() => setActiveId(run.id)}
                        data-testid={`sync-log-row-${run.id}`}
                      >
                        <TableCell className="font-mono text-xs font-medium tabular-nums">
                          <span className="flex items-center gap-2">
                            {run.id.slice(-8)}
                            <Icon
                              name="arrowRight"
                              trigger="group-hover"
                              size={13}
                              className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                            />
                          </span>
                        </TableCell>
                        <TableCell
                          className="whitespace-nowrap text-sm text-muted-foreground"
                          title={formatDateTime(run.started_at)}
                        >
                          {formatRelativeTime(run.started_at)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={run.status} />
                        </TableCell>
                        <TableCell>
                          <Badge variant={trig.variant} className="gap-1">
                            {trig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden font-mono text-xs uppercase text-muted-foreground lg:table-cell">
                          {run.source}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatNumber(run.counts.scanned)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-success">
                          +{formatNumber(run.counts.added)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-info">
                          ~{formatNumber(run.counts.updated)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                          −{formatNumber(run.counts.removed)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono text-sm tabular-nums ${
                            run.counts.failed > 0 ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          ✕{formatNumber(run.counts.failed)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatLatency(run.duration_ms)}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {run.error ? (
                            <span
                              className="block max-w-56 truncate text-xs text-destructive"
                              title={run.error}
                            >
                              {run.error}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {filtered.map((run) => {
                const trig = triggerMeta(run.trigger);
                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => setActiveId(run.id)}
                    className="group w-full rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40"
                    data-testid={`sync-log-card-${run.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium tabular-nums">
                        {run.id.slice(-8)}
                      </span>
                      <StatusBadge status={run.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatRelativeTime(run.started_at)} · {formatLatency(run.duration_ms)}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
                      <span className="text-success">
                        +{formatNumber(run.counts.added)} added
                      </span>
                      <span className="text-info">
                        ~{formatNumber(run.counts.updated)} updated
                      </span>
                      <span className="text-muted-foreground">
                        −{formatNumber(run.counts.removed)} removed
                      </span>
                      <span
                        className={
                          run.counts.failed > 0 ? "text-destructive" : "text-muted-foreground"
                        }
                      >
                        ✕{formatNumber(run.counts.failed)} failed
                      </span>
                    </div>
                    {run.error && (
                      <p className="mt-2 truncate text-xs text-destructive">{run.error}</p>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <Badge variant={trig.variant}>{trig.label}</Badge>
                      <span className="flex items-center gap-1 text-xs text-primary">
                        View detail
                        <Icon name="arrowRight" trigger="group-hover" size={13} />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </QueryBoundary>

      <SyncRunDrawer
        run={activeRun}
        open={activeRun !== null}
        onOpenChange={(open) => {
          if (!open) setActiveId(null);
        }}
      />
    </div>
  );
}

function SyncRunDrawer({
  run,
  open,
  onOpenChange,
}: {
  run: SyncLogRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trig = run ? triggerMeta(run.trigger) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-lg"
        data-testid="sync-run-drawer"
      >
        {run && trig && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                  <Icon name="database" size={18} />
                </span>
                <div className="min-w-0">
                  <SheetTitle className="truncate font-mono text-base">{run.id}</SheetTitle>
                  <SheetDescription>Pincode sync run</SheetDescription>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={run.status} testId="sync-run-drawer-status" />
                <Badge variant={trig.variant}>{trig.label}</Badge>
                <Badge variant="muted" className="font-mono uppercase">
                  {run.source}
                </Badge>
              </div>
            </SheetHeader>

            <div className="space-y-6 p-6">
              {/* Timing */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Timing
                </h3>
                <dl className="space-y-2.5 text-sm">
                  <DetailRow label="Started">
                    <span className="font-mono text-xs tabular-nums">
                      {formatDateTime(run.started_at)}
                    </span>
                  </DetailRow>
                  <DetailRow label="Finished">
                    <span className="font-mono text-xs tabular-nums">
                      {run.ended_at ? formatDateTime(run.ended_at) : "—"}
                    </span>
                  </DetailRow>
                  <DetailRow label="Duration">
                    <span className="font-mono text-xs tabular-nums">
                      {formatLatency(run.duration_ms)}
                    </span>
                  </DetailRow>
                  <DetailRow label="Trigger">
                    <span className="capitalize">{trig.label}</span>
                  </DetailRow>
                  <DetailRow label="Source">
                    <span className="font-mono text-xs uppercase">{run.source}</span>
                  </DetailRow>
                </dl>
              </section>

              {/* Counters */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Record counts
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <CounterTile
                    label="Scanned"
                    value={formatNumber(run.counts.scanned)}
                    testId="sync-run-counter-scanned"
                  />
                  <CounterTile
                    label="Added"
                    value={`+${formatNumber(run.counts.added)}`}
                    tone="success"
                    testId="sync-run-counter-added"
                  />
                  <CounterTile
                    label="Updated"
                    value={`~${formatNumber(run.counts.updated)}`}
                    tone="info"
                    testId="sync-run-counter-updated"
                  />
                  <CounterTile
                    label="Removed"
                    value={`−${formatNumber(run.counts.removed)}`}
                    testId="sync-run-counter-removed"
                  />
                  <CounterTile
                    label="Failed"
                    value={`✕${formatNumber(run.counts.failed)}`}
                    tone={run.counts.failed > 0 ? "destructive" : undefined}
                    testId="sync-run-counter-failed"
                  />
                </div>
              </section>

              {/* Failures & errors */}
              <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Failures &amp; errors
                </h3>
                {run.error && (
                  <div
                    className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                    data-testid="sync-run-error"
                  >
                    {run.error}
                  </div>
                )}
                {!run.error && run.counts.failed > 0 && (
                  <div
                    className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-muted-foreground"
                    data-testid="sync-run-failed-summary"
                  >
                    {formatNumber(run.counts.failed)} record
                    {run.counts.failed === 1 ? "" : "s"} failed validation and{" "}
                    {run.counts.failed === 1 ? "was" : "were"} skipped. The rest of the run
                    applied cleanly.
                  </div>
                )}
                {!run.error && run.counts.failed === 0 && (
                  <div
                    className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-success/5 px-4 py-3 text-sm text-muted-foreground"
                    data-testid="sync-run-no-failed"
                  >
                    <Icon name="checkCircle" size={16} className="text-success" />
                    No failed records — every scanned pincode applied cleanly.
                  </div>
                )}
              </section>
            </div>

            <SheetFooter>
              <Button
                variant="gradient"
                asChild
                className="w-full"
                data-testid="sync-run-rerun-link"
              >
                <Link href="/admin/pincodes" className="group">
                  <Icon name="upload" trigger="group-hover" size={16} className="text-white" />
                  Import a new CSV
                </Link>
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function CounterTile({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: "success" | "info" | "destructive";
  testId: string;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "info"
        ? "text-info"
        : tone === "destructive"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-background px-3.5 py-3" data-testid={testId}>
      <p className={`font-mono text-lg font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
