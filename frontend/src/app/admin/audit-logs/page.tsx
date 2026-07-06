"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon, type IconName } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { listAdminAuditLogs, type AdminAuditLog } from "@/lib/api/services/admin";
import { formatRelativeTime, formatDateTime, formatNumber } from "@/lib/format";

const PAGE_SIZE = 50;

/** Categories accepted by GET /admin/audit-logs. */
const CATEGORIES = ["billing", "security", "config", "data", "support", "pincode", "auth"] as const;
/** Severities accepted by GET /admin/audit-logs. */
const SEVERITIES = ["info", "notice", "warning", "critical"] as const;

type Severity = AdminAuditLog["severity"];

const SEVERITY_META: Record<
  Severity,
  { label: string; variant: React.ComponentProps<typeof Badge>["variant"]; icon: IconName }
> = {
  info: { label: "Info", variant: "info", icon: "activity" },
  notice: { label: "Notice", variant: "secondary", icon: "bellRing" },
  warning: { label: "Warning", variant: "warning", icon: "shield" },
  critical: { label: "Critical", variant: "destructive", icon: "shieldCheck" },
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const meta = SEVERITY_META[severity];
  return (
    <Badge variant={meta.variant} data-testid={`audit-severity-${severity}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge variant="outline" className="font-mono text-[11px]">
      {category}
    </Badge>
  );
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const v = outcome.toLowerCase();
  const variant: React.ComponentProps<typeof Badge>["variant"] =
    v === "success" || v === "ok"
      ? "success"
      : v === "failed" || v === "failure" || v === "error"
        ? "destructive"
        : v === "denied" || v === "blocked"
          ? "warning"
          : "muted";
  return (
    <Badge variant={variant} className="capitalize">
      {outcome.replace(/_/g, " ")}
    </Badge>
  );
}

function ActorCell({ log }: { log: AdminAuditLog }) {
  const isSystem = log.actor === "system";
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
        aria-hidden
      >
        <Icon name={isSystem ? "zap" : "users"} size={14} />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">
          {isSystem ? "System" : log.actor}
        </p>
        <StatusBadge status={log.actor_role} className="text-[11px]" />
      </div>
    </div>
  );
}

/** Exact timestamp with a relative-time tooltip on hover. */
function TimeCell({ at }: { at: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="cursor-default whitespace-nowrap text-sm text-muted-foreground tabular-nums"
          tabIndex={0}
        >
          {formatDateTime(at)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{formatRelativeTime(at)}</TooltipContent>
    </Tooltip>
  );
}

function csvCell(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function AdminAuditLogsPage() {
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [severityFilter, setSeverityFilter] = React.useState("all");
  const [offset, setOffset] = React.useState(0);
  const [selected, setSelected] = React.useState<AdminAuditLog | null>(null);

  // Debounce the search input (~350ms) and reset to the first page on change.
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setOffset(0);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const q = useQuery({
    queryKey: [
      "admin",
      "audit-logs",
      { q: debouncedQuery, category: categoryFilter, severity: severityFilter, limit: PAGE_SIZE, offset },
    ],
    queryFn: () =>
      listAdminAuditLogs({
        limit: PAGE_SIZE,
        offset,
        category: categoryFilter === "all" ? undefined : categoryFilter,
        severity: severityFilter === "all" ? undefined : severityFilter,
        q: debouncedQuery || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const logs = q.data?.logs ?? [];
  const total = q.data?.total ?? 0;

  const filtersActive = query !== "" || categoryFilter !== "all" || severityFilter !== "all";

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setCategoryFilter("all");
    setSeverityFilter("all");
    setOffset(0);
  }

  function exportCsv() {
    if (logs.length === 0) return;
    const header = ["id", "at", "actor", "actor_role", "action", "category", "target", "outcome", "severity", "ip"];
    const lines = [
      header.join(","),
      ...logs.map((l) =>
        [l.id, l.at, l.actor, l.actor_role, l.action, l.category, l.target, l.outcome, l.severity, l.ip ?? ""]
          .map(csvCell)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "postpin-audit-logs.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${logs.length} of ${total} event${total === 1 ? "" : "s"} (this page)`);
  }

  const from = total === 0 ? 0 : offset + 1;
  const to = offset + logs.length;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Platform"
          title="Audit logs"
          description="An immutable, append-only record of every state-changing action — who did what, to which entity, when and from where."
        >
          <Button
            variant="outline"
            className="group"
            onClick={exportCsv}
            disabled={logs.length === 0}
            data-testid="audit-export-btn"
          >
            <Icon name="download" trigger="group-hover" size={16} /> Export CSV
          </Button>
        </PageHeader>

        {/* Immutability note */}
        <Alert variant="info" data-testid="audit-immutability-note">
          <Icon name="lock" size={16} />
          <AlertTitle>Immutable by design</AlertTitle>
          <AlertDescription>
            Events cannot be edited or deleted from this interface. Records are
            append-only and retained for compliance — export is the only way data leaves.
          </AlertDescription>
        </Alert>

        {/* Filters */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground tabular-nums">{formatNumber(total)}</span>{" "}
            event{total === 1 ? "" : "s"}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-56">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Icon name="search" size={16} />
              </span>
              <Input
                placeholder="Search actor, action or target"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
                data-testid="audit-search-input"
              />
            </div>

            <Select
              value={categoryFilter}
              onValueChange={(v) => {
                setCategoryFilter(v);
                setOffset(0);
              }}
            >
              <SelectTrigger className="w-full sm:w-40" data-testid="audit-category-filter">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={severityFilter}
              onValueChange={(v) => {
                setSeverityFilter(v);
                setOffset(0);
              }}
            >
              <SelectTrigger className="w-full sm:w-40" data-testid="audit-severity-filter">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SEVERITY_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {filtersActive && (
              <Button variant="ghost" onClick={clearFilters} data-testid="audit-clear-filters-btn">
                Clear
              </Button>
            )}
          </div>
        </div>

        <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
          {logs.length === 0 ? (
            <EmptyState
              icon="audit"
              title={filtersActive ? "No events match these filters" : "No audit events yet"}
              description={
                filtersActive
                  ? "Try a different category or severity, or clear your search — the audit trail is append-only, so events are never removed."
                  : "State-changing actions across the platform will appear here as they happen."
              }
              testId="audit-empty-state"
            >
              {filtersActive && (
                <Button variant="outline" onClick={clearFilters} data-testid="audit-empty-clear-btn">
                  Clear filters
                </Button>
              )}
            </EmptyState>
          ) : (
            <>
              {/* Desktop / tablet table */}
              <Card className="hidden overflow-x-auto p-0 md:block" data-testid="audit-table">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow
                        key={log.id}
                        className="group cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelected(log)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(log);
                          }
                        }}
                        data-testid={`audit-row-${log.id}`}
                      >
                        <TableCell>
                          <TimeCell at={log.at} />
                        </TableCell>
                        <TableCell>
                          <ActorCell log={log} />
                        </TableCell>
                        <TableCell>
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                            {log.action}
                          </code>
                        </TableCell>
                        <TableCell>
                          <CategoryBadge category={log.category} />
                        </TableCell>
                        <TableCell className="max-w-56">
                          <span className="block truncate text-sm text-foreground">{log.target}</span>
                        </TableCell>
                        <TableCell>
                          <OutcomeBadge outcome={log.outcome} />
                        </TableCell>
                        <TableCell>
                          <SeverityBadge severity={log.severity} />
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            {log.ip ?? "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              {/* Mobile cards */}
              <div className="grid gap-3 md:hidden">
                {logs.map((log) => (
                  <Card
                    key={log.id}
                    className="group cursor-pointer p-4"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(log)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(log);
                      }
                    }}
                    data-testid={`audit-card-${log.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                        {log.action}
                      </code>
                      <SeverityBadge severity={log.severity} />
                    </div>
                    <p className="mt-2 text-sm text-foreground">{log.target}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <CategoryBadge category={log.category} />
                      <OutcomeBadge outcome={log.outcome} />
                    </div>
                    <Separator className="my-3" />
                    <div className="flex items-center justify-between gap-3">
                      <ActorCell log={log} />
                      <TimeCell at={log.at} />
                    </div>
                    <p className="mt-2 font-mono text-xs tabular-nums text-muted-foreground">
                      IP {log.ip ?? "—"}
                    </p>
                  </Card>
                ))}
              </div>

              {/* Server pagination */}
              <div
                className="flex flex-col items-center justify-between gap-3 sm:flex-row"
                data-testid="audit-pagination"
              >
                <p className="text-sm text-muted-foreground">
                  Showing{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {from}–{to}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatNumber(total)}
                  </span>{" "}
                  events
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0 || q.isFetching}
                    onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                    data-testid="audit-prev-page-btn"
                  >
                    Previous
                  </Button>
                  <span className="px-1 text-sm text-muted-foreground tabular-nums">
                    Page {page} of {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="group"
                    disabled={offset + PAGE_SIZE >= total || q.isFetching}
                    onClick={() => setOffset((o) => o + PAGE_SIZE)}
                    data-testid="audit-next-page-btn"
                  >
                    Next
                    <Icon name="arrowRight" trigger="group-hover" size={15} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </QueryBoundary>

        {/* Event detail sheet */}
        <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
          <SheetContent
            className="w-full gap-0 overflow-y-auto sm:max-w-lg"
            data-testid="audit-detail-sheet"
          >
            {selected && (
              <>
                <SheetHeader>
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon name={SEVERITY_META[selected.severity].icon} size={16} />
                    </span>
                    <SeverityBadge severity={selected.severity} />
                  </div>
                  <SheetTitle className="font-mono">{selected.action}</SheetTitle>
                  <SheetDescription>
                    {selected.target} · {formatDateTime(selected.at)} IST
                  </SheetDescription>
                </SheetHeader>

                <div className="space-y-6 p-6">
                  {/* Full metadata */}
                  <section className="space-y-3" data-testid="audit-detail-metadata">
                    <h4 className="text-sm font-semibold text-foreground">Metadata</h4>
                    <dl className="grid grid-cols-3 gap-x-3 gap-y-3 text-sm">
                      <dt className="text-muted-foreground">Event ID</dt>
                      <dd className="col-span-2 font-mono text-xs tabular-nums">{selected.id}</dd>

                      <dt className="text-muted-foreground">Actor</dt>
                      <dd className="col-span-2 flex flex-wrap items-center gap-2">
                        {selected.actor === "system" ? "System" : selected.actor}
                        <StatusBadge status={selected.actor_role} className="text-[11px]" />
                      </dd>

                      <dt className="text-muted-foreground">Action</dt>
                      <dd className="col-span-2 font-mono text-xs">{selected.action}</dd>

                      <dt className="text-muted-foreground">Category</dt>
                      <dd className="col-span-2">
                        <CategoryBadge category={selected.category} />
                      </dd>

                      <dt className="text-muted-foreground">Target</dt>
                      <dd className="col-span-2">{selected.target}</dd>

                      <dt className="text-muted-foreground">Outcome</dt>
                      <dd className="col-span-2">
                        <OutcomeBadge outcome={selected.outcome} />
                      </dd>

                      <dt className="text-muted-foreground">IP address</dt>
                      <dd className="col-span-2 font-mono text-xs tabular-nums">
                        {selected.ip ?? "—"}
                      </dd>

                      <dt className="text-muted-foreground">Timestamp</dt>
                      <dd className="col-span-2 tabular-nums">
                        {formatDateTime(selected.at)} IST
                        <span className="ml-1 text-muted-foreground">
                          ({formatRelativeTime(selected.at)})
                        </span>
                      </dd>

                      <dt className="text-muted-foreground">Severity</dt>
                      <dd className="col-span-2">
                        <SeverityBadge severity={selected.severity} />
                      </dd>
                    </dl>
                  </section>

                  <Alert variant="info" data-testid="audit-detail-immutability">
                    <Icon name="shieldCheck" size={16} />
                    <AlertDescription>
                      This record is immutable and cannot be modified or removed.
                    </AlertDescription>
                  </Alert>
                </div>

                <SheetFooter className="flex-row justify-end gap-2">
                  <Button
                    variant="outline"
                    className="group"
                    onClick={() => {
                      navigator.clipboard?.writeText(selected.id);
                      toast.success("Event ID copied");
                    }}
                    data-testid="audit-detail-copy-btn"
                  >
                    <Icon name="copy" trigger="group-hover" size={16} /> Copy ID
                  </Button>
                  <Button
                    variant="secondary"
                    className="group"
                    onClick={() => setSelected(null)}
                    data-testid="audit-detail-close-btn"
                  >
                    Close
                  </Button>
                </SheetFooter>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
