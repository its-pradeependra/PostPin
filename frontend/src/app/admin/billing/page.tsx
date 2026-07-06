"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import {
  adminRefundInvoice,
  getAdminBillingSummary,
  listAdminInvoices,
  type AdminInvoiceRow,
} from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";
import { formatCurrency, formatNumber, formatDate } from "@/lib/format";

const PAGE_SIZE = 10;

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

function PlanBadge({ plan }: { plan: string }) {
  const label = PLAN_LABEL[plan] ?? plan.charAt(0).toUpperCase() + plan.slice(1);
  return (
    <Badge variant={PLAN_BADGE[plan] ?? "muted"} data-testid={`admin-billing-plan-badge-${plan}`}>
      {label}
    </Badge>
  );
}

function csvCell(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function AdminBillingPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [offset, setOffset] = React.useState(0);

  // Debounce the search input (~350ms) and reset to the first page on change.
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setOffset(0);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const summaryQ = useQuery({
    queryKey: ["admin", "billing", "summary"],
    queryFn: getAdminBillingSummary,
  });

  const invoicesQ = useQuery({
    queryKey: [
      "admin",
      "billing",
      "invoices",
      { status: statusFilter, q: debouncedQuery, limit: PAGE_SIZE, offset },
    ],
    queryFn: () =>
      listAdminInvoices({
        status: statusFilter === "all" ? undefined : statusFilter,
        q: debouncedQuery || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    placeholderData: (prev) => prev,
  });

  const summary = summaryQ.data;
  const invoiceRows = invoicesQ.data?.invoices ?? [];
  const total = invoicesQ.data?.total ?? 0;

  const refundM = useMutation({
    mutationFn: (inv: AdminInvoiceRow) => adminRefundInvoice(inv.id),
    onSuccess: (_res, inv) => {
      // Prefix invalidation refreshes BOTH the billing summary and the invoice list.
      void qc.invalidateQueries({ queryKey: ["admin", "billing"] });
      toast.success(`${inv.number} refunded`, {
        description: "The tenant has been moved to the Free plan.",
      });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't refund the invoice"),
  });

  const filtersActive = statusFilter !== "all" || query !== "";

  function clearFilters() {
    setStatusFilter("all");
    setQuery("");
    setDebouncedQuery("");
    setOffset(0);
  }

  function exportCsv() {
    if (invoiceRows.length === 0) return;
    const header = ["id", "number", "company", "plan", "amount", "status", "issued_at", "paid_at"];
    const lines = [
      header.join(","),
      ...invoiceRows.map((inv) =>
        [
          inv.id,
          inv.number,
          inv.company_name,
          inv.plan,
          inv.amount,
          inv.status,
          inv.issued_at,
          inv.paid_at ?? "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "postpin-invoices.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${invoiceRows.length} of ${total} invoice${total === 1 ? "" : "s"} (this page)`);
  }

  const from = total === 0 ? 0 : offset + 1;
  const to = offset + invoiceRows.length;

  return (
    <div className="space-y-6" data-testid="admin-billing-page">
      <PageHeader
        title="Billing & revenue"
        description="Platform-wide revenue across all tenants — MRR, collections, refunds and the full invoice ledger."
        eyebrow="Tenants"
      >
        <Button
          variant="outline"
          className="group"
          onClick={exportCsv}
          disabled={invoiceRows.length === 0}
          data-testid="admin-billing-export-btn"
        >
          <Icon name="download" size={16} /> Export page CSV
        </Button>
      </PageHeader>

      {/* KPIs */}
      <QueryBoundary
        isLoading={summaryQ.isLoading}
        error={summaryQ.error}
        onRetry={() => void summaryQ.refetch()}
      >
        {summary && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="MRR"
              value={formatCurrency(summary.mrr)}
              icon="dollar"
              hint={`${formatNumber(summary.paying_tenants)} paying tenant${summary.paying_tenants === 1 ? "" : "s"}`}
              testId="admin-billing-mrr-card"
            />
            <StatCard
              label="ARR (estimate)"
              value={formatCurrency(summary.mrr * 12)}
              icon="trending"
              hint="MRR × 12 run-rate"
              testId="admin-billing-arr-card"
            />
            <StatCard
              label="ARPU"
              value={formatCurrency(summary.arpu)}
              icon="users"
              hint="Average revenue per paying tenant"
              testId="admin-billing-arpu-card"
            />
            <StatCard
              label="Collected (30d)"
              value={formatCurrency(summary.collected_30d)}
              icon="wallet"
              hint={`${formatNumber(summary.collected_30d_count)} payment${summary.collected_30d_count === 1 ? "" : "s"} captured`}
              testId="admin-billing-collected-card"
            />
            <StatCard
              label="Refunded (30d)"
              value={formatCurrency(summary.refunded_30d)}
              icon="coins"
              hint="Returned to tenants in the last 30 days"
              testId="admin-billing-refunds-card"
            />
            <StatCard
              label="Past due"
              value={formatNumber(summary.past_due_count)}
              icon="notifications"
              hint={`${formatCurrency(summary.past_due_amount)} outstanding`}
              testId="admin-billing-failed-card"
            />
          </div>
        )}
      </QueryBoundary>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Invoices across tenants */}
        <Card className="lg:col-span-2" data-testid="admin-billing-invoices-card">
          <CardHeader>
            <CardTitle className="text-base">Invoices across tenants</CardTitle>
            <CardDescription>Platform-wide billing statements — search, filter and refund.</CardDescription>
            <CardAction>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Icon name="search" size={14} />
                  </span>
                  <Input
                    placeholder="Company or number"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-9 w-full pl-8 sm:w-52"
                    data-testid="admin-billing-invoice-search-input"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v);
                    setOffset(0);
                  }}
                >
                  <SelectTrigger className="h-9 w-[140px]" data-testid="admin-billing-status-filter">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="past_due">Past due</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <QueryBoundary
              isLoading={invoicesQ.isLoading}
              error={invoicesQ.error}
              onRetry={() => void invoicesQ.refetch()}
            >
              {invoiceRows.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-10 text-center"
                  data-testid="admin-billing-invoices-empty"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                    <Icon name="invoice" size={22} />
                  </span>
                  <p className="font-display text-sm font-semibold">
                    {filtersActive ? "No invoices match" : "No invoices yet"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {filtersActive
                      ? "Try a different status or search term."
                      : "Invoices appear here as tenants are billed."}
                  </p>
                  {filtersActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1"
                      onClick={clearFilters}
                      data-testid="admin-billing-clear-filter-btn"
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="-mx-2 overflow-x-auto sm:mx-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Tenant</TableHead>
                          <TableHead className="hidden md:table-cell">Plan</TableHead>
                          <TableHead className="hidden text-right sm:table-cell">Amount</TableHead>
                          <TableHead className="hidden text-right md:table-cell">Issued</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoiceRows.map((inv) => (
                          <TableRow key={inv.id} data-testid={`admin-billing-invoice-row-${inv.id}`}>
                            <TableCell className="font-mono text-sm font-medium">
                              {inv.number}
                            </TableCell>
                            <TableCell className="font-medium">{inv.company_name}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              <PlanBadge plan={inv.plan} />
                            </TableCell>
                            <TableCell className="hidden text-right font-medium tabular-nums sm:table-cell">
                              {formatCurrency(inv.amount)}
                            </TableCell>
                            <TableCell className="hidden text-right text-sm text-muted-foreground tabular-nums md:table-cell">
                              {formatDate(inv.issued_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              <StatusBadge
                                status={inv.status}
                                testId={`admin-billing-invoice-status-${inv.id}`}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              {inv.status === "refunded" ? (
                                <span
                                  className="text-xs font-medium text-muted-foreground"
                                  data-testid={`admin-billing-refunded-label-${inv.id}`}
                                >
                                  Refunded
                                </span>
                              ) : inv.status === "paid" ? (
                                <ConfirmDialog
                                  testId={`admin-billing-refund-dialog-${inv.id}`}
                                  trigger={
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="group text-muted-foreground"
                                      disabled={refundM.isPending}
                                      data-testid={`admin-billing-refund-btn-${inv.id}`}
                                    >
                                      <Icon name="coins" size={14} /> Refund
                                    </Button>
                                  }
                                  title={`Refund ${inv.number}?`}
                                  description="The tenant drops to the Free plan immediately."
                                  confirmLabel="Issue refund"
                                  destructive
                                  onConfirm={() => refundM.mutate(inv)}
                                />
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground"
                                  disabled
                                  data-testid={`admin-billing-refund-btn-${inv.id}`}
                                >
                                  <Icon name="coins" size={14} /> Refund
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Server pagination */}
                  <div
                    className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row"
                    data-testid="admin-billing-invoices-pagination"
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
                      invoices
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={offset === 0 || invoicesQ.isFetching}
                        onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                        data-testid="admin-billing-prev-page-btn"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="group"
                        disabled={offset + PAGE_SIZE >= total || invoicesQ.isFetching}
                        onClick={() => setOffset((o) => o + PAGE_SIZE)}
                        data-testid="admin-billing-next-page-btn"
                      >
                        Next
                        <Icon name="arrowRight" size={15} />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </QueryBoundary>
          </CardContent>
        </Card>

        {/* Plan mix */}
        <Card data-testid="admin-billing-plan-mix-card">
          <CardHeader>
            <CardTitle className="text-base">Plan mix</CardTitle>
            <CardDescription>Tenants by subscription plan.</CardDescription>
            <CardAction>
              <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                <Icon name="users" size={18} />
              </span>
            </CardAction>
          </CardHeader>
          <CardContent>
            <QueryBoundary
              isLoading={summaryQ.isLoading}
              error={summaryQ.error}
              onRetry={() => void summaryQ.refetch()}
            >
              {summary && summary.plan_mix.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground" data-testid="admin-billing-plan-mix-empty">
                  No subscribed tenants yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {(summary?.plan_mix ?? []).map((row, i) => (
                    <div key={row.plan}>
                      {i > 0 && <Separator className="mb-3" />}
                      <div
                        className="flex items-center justify-between gap-3"
                        data-testid={`admin-billing-plan-mix-row-${row.plan}`}
                      >
                        <PlanBadge plan={row.plan} />
                        <p className="text-sm text-muted-foreground">
                          <span className="font-mono font-semibold text-foreground tabular-nums">
                            {formatNumber(row.tenants)}
                          </span>{" "}
                          tenant{row.tenants === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </QueryBoundary>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
