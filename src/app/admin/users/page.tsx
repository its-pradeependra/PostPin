"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  activateTenant,
  listTenants,
  suspendTenant,
  type TenantRow,
} from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";
import { formatCurrency, formatNumber, formatDate, formatCompact } from "@/lib/format";

const PAGE_SIZE = 12;

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
  enterprise: "Enterprise",
};

const PLAN_BADGE: Record<string, React.ComponentProps<typeof Badge>["variant"]> = {
  free: "muted",
  starter: "info",
  growth: "gradient",
  scale: "default",
  enterprise: "secondary",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function PlanBadge({ plan }: { plan: string }) {
  const label = PLAN_LABEL[plan] ?? plan.charAt(0).toUpperCase() + plan.slice(1);
  return (
    <Badge variant={PLAN_BADGE[plan] ?? "muted"} data-testid={`users-plan-badge-${plan}`}>
      {label}
    </Badge>
  );
}

/** Mini quota progress used in the table + cards. */
function QuotaMeter({ tenant }: { tenant: TenantRow }) {
  const metered = tenant.monthly_quota > 0;
  const pct = metered
    ? Math.min(100, Math.round((tenant.calls_30d / tenant.monthly_quota) * 100))
    : 0;
  const over = metered && pct >= 90;
  return (
    <div className="min-w-[7.5rem] space-y-1">
      <div className="flex items-center justify-between gap-2 font-mono text-xs tabular-nums">
        <span className="text-foreground">{formatCompact(tenant.calls_30d)}</span>
        <span className="text-muted-foreground">
          {metered ? formatCompact(tenant.monthly_quota) : "—"}
        </span>
      </div>
      <Progress
        value={pct}
        className="h-1.5"
        indicatorClassName={over ? "bg-warning" : undefined}
        data-testid={`users-quota-progress-${tenant.id}`}
      />
    </div>
  );
}

/** Per-row actions menu. */
function RowActions({
  tenant,
  onSuspend,
  onActivate,
}: {
  tenant: TenantRow;
  onSuspend: (t: TenantRow) => void;
  onActivate: (t: TenantRow) => void;
}) {
  const suspended = tenant.status === "suspended";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="group"
          aria-label={`Actions for ${tenant.name}`}
          data-testid={`users-row-actions-${tenant.id}`}
        >
          <Icon name="more" trigger="group-hover" size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Manage tenant</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={`/admin/users/${tenant.id}`} data-testid={`users-action-view-${tenant.id}`}>
            <Icon name="eye" size={16} /> View
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            navigator.clipboard?.writeText(tenant.owner_email);
            toast.success("Owner email copied");
          }}
          data-testid={`users-action-copy-email-${tenant.id}`}
        >
          <Icon name="copy" size={16} /> Copy email
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {suspended ? (
          <ConfirmDialog
            trigger={
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                data-testid={`users-action-activate-${tenant.id}`}
              >
                <Icon name="checkCircle" size={16} /> Activate
              </DropdownMenuItem>
            }
            title={`Reactivate ${tenant.name}?`}
            description="API keys resume returning rates immediately and billing restarts on the next cycle."
            confirmLabel="Reactivate"
            onConfirm={() => onActivate(tenant)}
            testId={`users-activate-dialog-${tenant.id}`}
          />
        ) : (
          <ConfirmDialog
            trigger={
              <DropdownMenuItem
                variant="destructive"
                onSelect={(e) => e.preventDefault()}
                data-testid={`users-action-suspend-${tenant.id}`}
              >
                <Icon name="lock" size={16} /> Suspend
              </DropdownMenuItem>
            }
            title={`Suspend ${tenant.name}?`}
            description={`${tenant.api_keys} API key${tenant.api_keys === 1 ? "" : "s"} will immediately stop returning rates. The owner is notified and billing pauses. This is reversible.`}
            confirmLabel="Suspend tenant"
            destructive
            onConfirm={() => onSuspend(tenant)}
            testId={`users-suspend-dialog-${tenant.id}`}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function csvCell(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [planFilter, setPlanFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [offset, setOffset] = React.useState(0);

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
      "tenants",
      { q: debouncedQuery, plan: planFilter, status: statusFilter, limit: PAGE_SIZE, offset },
    ],
    queryFn: () =>
      listTenants({
        q: debouncedQuery || undefined,
        plan: planFilter === "all" ? undefined : planFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: PAGE_SIZE,
        offset,
      }),
    placeholderData: (prev) => prev,
  });

  const tenants = q.data?.tenants ?? [];
  const total = q.data?.total ?? 0;

  const suspendM = useMutation({
    mutationFn: (t: TenantRow) => suspendTenant(t.id),
    onSuccess: (_res, t) => {
      void qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
      toast.success(`${t.name} suspended`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't suspend the tenant"),
  });

  const activateM = useMutation({
    mutationFn: (t: TenantRow) => activateTenant(t.id),
    onSuccess: (_res, t) => {
      void qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
      toast.success(`${t.name} reactivated`);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn't reactivate the tenant"),
  });

  const filtersActive = query !== "" || planFilter !== "all" || statusFilter !== "all";

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setPlanFilter("all");
    setStatusFilter("all");
    setOffset(0);
  }

  function exportCsv() {
    if (tenants.length === 0) return;
    const header = [
      "id",
      "name",
      "slug",
      "status",
      "owner_name",
      "owner_email",
      "plan",
      "mrr",
      "calls_30d",
      "monthly_quota",
      "api_keys",
      "joined_at",
    ];
    const lines = [
      header.join(","),
      ...tenants.map((t) =>
        [
          t.id,
          t.name,
          t.slug,
          t.status,
          t.owner_name,
          t.owner_email,
          t.plan,
          t.mrr,
          t.calls_30d,
          t.monthly_quota,
          t.api_keys,
          t.joined_at,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "postpin-tenants.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${tenants.length} of ${total} tenant${total === 1 ? "" : "s"} (this page)`);
  }

  const from = total === 0 ? 0 : offset + 1;
  const to = offset + tenants.length;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tenants"
        title="Users"
        description="Find, segment and act on any tenant — search, filter by plan and status, then jump into a full account view."
      >
        <Button
          variant="outline"
          className="group"
          onClick={exportCsv}
          disabled={tenants.length === 0}
          data-testid="users-export-csv-btn"
        >
          <Icon name="download" trigger="group-hover" size={16} /> Export CSV
        </Button>
      </PageHeader>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Icon name="search" size={16} />
          </span>
          <Input
            placeholder="Search company, owner or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            data-testid="users-search-input"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select
            value={planFilter}
            onValueChange={(v) => {
              setPlanFilter(v);
              setOffset(0);
            }}
          >
            <SelectTrigger className="w-full sm:w-40" data-testid="users-plan-filter">
              <SelectValue placeholder="Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="starter">Starter</SelectItem>
              <SelectItem value="growth">Growth</SelectItem>
              <SelectItem value="scale">Scale</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setOffset(0);
            }}
          >
            <SelectTrigger className="w-full sm:w-40" data-testid="users-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button
              variant="ghost"
              onClick={clearFilters}
              data-testid="users-clear-filters-btn"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
        {tenants.length === 0 ? (
          <EmptyState
            icon="users"
            title={filtersActive ? "No tenants match these filters" : "No tenants yet"}
            description={
              filtersActive
                ? "Try a different plan or status, or clear your search to see every tenant."
                : "Tenants appear here as soon as companies sign up for Postpin."
            }
            testId="users-empty-state"
          >
            {filtersActive && (
              <Button variant="outline" onClick={clearFilters} data-testid="users-empty-clear-btn">
                Clear filters
              </Button>
            )}
          </EmptyState>
        ) : (
          <>
            {/* Desktop / tablet table */}
            <Card className="hidden overflow-x-auto p-0 md:block" data-testid="users-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Calls (30d) / quota</TableHead>
                    <TableHead className="text-right">Keys</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((u) => (
                    <TableRow key={u.id} className="group" data-testid={`users-row-${u.id}`}>
                      <TableCell>
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="font-medium text-foreground hover:text-primary"
                          data-testid={`users-company-link-${u.id}`}
                        >
                          {u.name}
                        </Link>
                        <p className="font-mono text-xs text-muted-foreground">{u.slug}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-8">
                            <AvatarFallback>{initials(u.owner_name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{u.owner_name}</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">
                              {u.owner_email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <PlanBadge plan={u.plan} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={u.status} testId={`users-status-${u.id}`} />
                      </TableCell>
                      <TableCell>
                        <QuotaMeter tenant={u} />
                      </TableCell>
                      <TableCell
                        className="text-right font-mono text-sm tabular-nums"
                        data-testid={`users-keys-count-${u.id}`}
                      >
                        {formatNumber(u.api_keys)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {u.mrr > 0 ? formatCurrency(u.mrr) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(u.joined_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          tenant={u}
                          onSuspend={(t) => suspendM.mutate(t)}
                          onActivate={(t) => activateM.mutate(t)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {/* Mobile cards */}
            <div className="grid gap-3 md:hidden">
              {tenants.map((u) => (
                <Card key={u.id} className="group p-4" data-testid={`users-card-${u.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar className="size-9">
                        <AvatarFallback>{initials(u.owner_name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="block truncate font-medium text-foreground hover:text-primary"
                          data-testid={`users-card-company-link-${u.id}`}
                        >
                          {u.name}
                        </Link>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {u.owner_email}
                        </p>
                      </div>
                    </div>
                    <RowActions
                      tenant={u}
                      onSuspend={(t) => suspendM.mutate(t)}
                      onActivate={(t) => activateM.mutate(t)}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <PlanBadge plan={u.plan} />
                    <StatusBadge status={u.status} />
                    <span className="ml-auto font-mono text-sm font-semibold tabular-nums">
                      {u.mrr > 0 ? formatCurrency(u.mrr) : "—"}
                    </span>
                  </div>
                  <div className="mt-3">
                    <QuotaMeter tenant={u} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Joined {formatDate(u.joined_at)}
                  </p>
                </Card>
              ))}
            </div>

            {/* Server pagination */}
            <div
              className="flex flex-col items-center justify-between gap-3 sm:flex-row"
              data-testid="users-pagination"
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
                tenants
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0 || q.isFetching}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  data-testid="users-prev-page-btn"
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
                  data-testid="users-next-page-btn"
                >
                  Next
                  <Icon name="arrowRight" trigger="group-hover" size={15} />
                </Button>
              </div>
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
