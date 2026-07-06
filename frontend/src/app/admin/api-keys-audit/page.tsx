"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { CopyButton } from "@/components/shared/copy-button";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  adminForceRevokeKey,
  listAdminApiKeys,
  type AdminApiKeyRow,
} from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";
import { formatNumber, formatDate, formatRelativeTime } from "@/lib/format";

const PAGE_SIZE = 25;

function ModeBadge({ mode }: { mode: AdminApiKeyRow["mode"] }) {
  return mode === "live" ? (
    <Badge variant="gradient" data-testid="apikeys-env-badge-live">
      Live
    </Badge>
  ) : (
    <Badge variant="muted" data-testid="apikeys-env-badge-test">
      Test
    </Badge>
  );
}

/** Revoke button (active keys) or a muted terminal-state note. */
function RevokeAction({
  apiKey,
  onRevoke,
  pending,
  idPrefix,
}: {
  apiKey: AdminApiKeyRow;
  onRevoke: (k: AdminApiKeyRow) => void;
  pending: boolean;
  idPrefix: string;
}) {
  if (apiKey.status === "revoked") {
    return (
      <span
        className="text-xs font-medium text-muted-foreground"
        data-testid={`${idPrefix}-revoked-note-${apiKey.id}`}
      >
        Revoked
      </span>
    );
  }
  if (apiKey.status === "expired") {
    return (
      <span
        className="text-xs font-medium text-muted-foreground"
        data-testid={`${idPrefix}-expired-note-${apiKey.id}`}
      >
        Expired
      </span>
    );
  }
  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className="group text-destructive hover:text-destructive"
          disabled={pending}
          data-testid={`${idPrefix}-revoke-btn-${apiKey.id}`}
        >
          <Icon name="trash" trigger="group-hover" size={15} />
          Revoke
        </Button>
      }
      title={`Force-revoke ${apiKey.name}?`}
      description={`${apiKey.company_name} will get 401s on this key immediately and the owner is notified.`}
      confirmLabel="Revoke key"
      destructive
      onConfirm={() => onRevoke(apiKey)}
      testId={`${idPrefix}-revoke-dialog-${apiKey.id}`}
    />
  );
}

function csvCell(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ApiKeysAuditPage() {
  const qc = useQueryClient();
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
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
      "api-keys",
      { q: debouncedQuery, status: statusFilter, limit: PAGE_SIZE, offset },
    ],
    queryFn: () =>
      listAdminApiKeys({
        q: debouncedQuery || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: PAGE_SIZE,
        offset,
      }),
    placeholderData: (prev) => prev,
  });

  const keys = q.data?.keys ?? [];
  const total = q.data?.total ?? 0;

  const revokeM = useMutation({
    mutationFn: (k: AdminApiKeyRow) => adminForceRevokeKey(k.id),
    onSuccess: (_res, k) => {
      void qc.invalidateQueries({ queryKey: ["admin", "api-keys"] });
      toast.success(`Key revoked — ${k.name}`, {
        description: `${k.company_name} now gets 401s on this key. The owner has been notified.`,
      });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn't revoke the key"),
  });

  // Page-scoped summary counts (active/revoked) derived from the fetched page;
  // the total comes straight from the API.
  const activeOnPage = keys.filter((k) => k.status === "active").length;
  const revokedOnPage = keys.filter((k) => k.status === "revoked").length;

  const filtersActive = query !== "" || statusFilter !== "all";

  function clearFilters() {
    setQuery("");
    setDebouncedQuery("");
    setStatusFilter("all");
    setOffset(0);
  }

  function exportCsv() {
    if (keys.length === 0) return;
    const header = [
      "id",
      "name",
      "masked",
      "mode",
      "status",
      "company_id",
      "company_name",
      "request_count",
      "last_used_at",
      "created_at",
    ];
    const lines = [
      header.join(","),
      ...keys.map((k) =>
        [
          k.id,
          k.name,
          k.masked,
          k.mode,
          k.status,
          k.company_id,
          k.company_name,
          k.request_count,
          k.last_used_at ?? "",
          k.created_at,
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "postpin-api-keys.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${keys.length} key${keys.length === 1 ? "" : "s"} (this page)`);
  }

  const from = total === 0 ? 0 : offset + 1;
  const to = offset + keys.length;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Developer"
        title="API Keys Audit"
        description="Platform-wide visibility into every API key across all tenants — mode, owner, request volume and status. Secrets are never shown; revoke suspicious keys on the spot."
      >
        <Button
          variant="outline"
          className="group"
          onClick={exportCsv}
          disabled={keys.length === 0}
          data-testid="apikeys-export-btn"
        >
          <Icon name="download" trigger="group-hover" size={16} /> Export
        </Button>
      </PageHeader>

      {/* Summary stat row */}
      {q.data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard
            label="Total keys"
            value={formatNumber(total)}
            icon="keys"
            hint={filtersActive ? "Matching current filters" : "Across all tenants"}
            testId="apikeys-stat-total"
          />
          <StatCard
            label="Active"
            value={formatNumber(activeOnPage)}
            icon="checkCircle"
            hint="On this page"
            testId="apikeys-stat-active"
          />
          <StatCard
            label="Revoked"
            value={formatNumber(revokedOnPage)}
            icon="lock"
            hint="On this page"
            testId="apikeys-stat-revoked"
          />
        </div>
      )}

      {/* Toolbar: search + status filter */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Icon name="search" size={16} />
          </span>
          <Input
            placeholder="Search tenant, key name or prefix"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            data-testid="apikeys-search-input"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setOffset(0);
            }}
          >
            <SelectTrigger className="w-full sm:w-40" data-testid="apikeys-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button
              variant="ghost"
              onClick={clearFilters}
              data-testid="apikeys-clear-filters-btn"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
        {keys.length === 0 ? (
          <EmptyState
            icon="keys"
            title={filtersActive ? "No API keys match these filters" : "No API keys yet"}
            description={
              filtersActive
                ? "Try a different search term or status, or clear the filters to see every key across all tenants."
                : "Keys appear here as soon as tenants mint them from their dashboards."
            }
            testId="apikeys-empty-state"
          >
            {filtersActive && (
              <Button
                variant="outline"
                onClick={clearFilters}
                data-testid="apikeys-empty-clear-btn"
              >
                Clear filters
              </Button>
            )}
          </EmptyState>
        ) : (
          <>
            {/* Desktop / tablet table */}
            <Card className="hidden overflow-x-auto p-0 md:block" data-testid="apikeys-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((k) => {
                    const revoked = k.status === "revoked";
                    return (
                      <TableRow key={k.id} className="group" data-testid={`apikeys-row-${k.id}`}>
                        <TableCell>
                          <Link
                            href={`/admin/users/${k.company_id}`}
                            className="font-medium text-foreground hover:text-primary"
                            data-testid={`apikeys-company-link-${k.id}`}
                          >
                            {k.company_name}
                          </Link>
                          <p className="font-mono text-xs text-muted-foreground">
                            {k.company_id}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1.5">
                            <p className="text-sm font-medium">{k.name}</p>
                            <div className="flex items-center gap-2">
                              <code
                                className={
                                  revoked
                                    ? "font-mono text-xs text-muted-foreground line-through"
                                    : "font-mono text-xs text-muted-foreground"
                                }
                              >
                                {k.masked}
                              </code>
                              <CopyButton
                                value={k.masked}
                                label="Copy"
                                testId={`apikeys-copy-${k.id}`}
                                toastMessage="Key prefix copied"
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <ModeBadge mode={k.mode} />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatNumber(k.request_count)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {k.last_used_at ? formatRelativeTime(k.last_used_at) : "Never"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(k.created_at)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={k.status} testId={`apikeys-status-${k.id}`} />
                        </TableCell>
                        <TableCell className="text-right">
                          <RevokeAction
                            apiKey={k}
                            onRevoke={(key) => revokeM.mutate(key)}
                            pending={revokeM.isPending}
                            idPrefix="apikeys"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            {/* Mobile cards */}
            <div className="grid gap-3 md:hidden">
              {keys.map((k) => {
                const revoked = k.status === "revoked";
                return (
                  <Card key={k.id} className="group p-4" data-testid={`apikeys-card-${k.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/admin/users/${k.company_id}`}
                          className="block truncate font-medium text-foreground hover:text-primary"
                          data-testid={`apikeys-card-company-link-${k.id}`}
                        >
                          {k.company_name}
                        </Link>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {k.company_id}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <ModeBadge mode={k.mode} />
                        <StatusBadge status={k.status} />
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      <p className="text-sm font-medium">{k.name}</p>
                      <div className="flex items-center gap-2">
                        <code
                          className={
                            revoked
                              ? "font-mono text-xs text-muted-foreground line-through"
                              : "font-mono text-xs text-muted-foreground"
                          }
                        >
                          {k.masked}
                        </code>
                        <CopyButton
                          value={k.masked}
                          testId={`apikeys-card-copy-${k.id}`}
                          toastMessage="Key prefix copied"
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="font-mono tabular-nums">
                        {formatNumber(k.request_count)} requests
                      </span>
                      <span>
                        {k.last_used_at
                          ? `Used ${formatRelativeTime(k.last_used_at)}`
                          : "Never used"}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        Created {formatDate(k.created_at)}
                      </span>
                      <RevokeAction
                        apiKey={k}
                        onRevoke={(key) => revokeM.mutate(key)}
                        pending={revokeM.isPending}
                        idPrefix="apikeys-card"
                      />
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Server pagination */}
            <div
              className="flex flex-col items-center justify-between gap-3 sm:flex-row"
              data-testid="apikeys-pagination"
            >
              <p className="text-sm text-muted-foreground" data-testid="apikeys-result-count">
                Showing{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {from}–{to}
                </span>{" "}
                of{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {formatNumber(total)}
                </span>{" "}
                keys
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0 || q.isFetching}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  data-testid="apikeys-prev-page-btn"
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
                  data-testid="apikeys-next-page-btn"
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
