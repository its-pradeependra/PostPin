"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import { downloadInvoicePdf, getInvoices, type InvoiceDto } from "@/lib/api/services/billing";
import { formatCurrency, formatDate } from "@/lib/format";

type StatusFilter = "all" | InvoiceDto["status"];

function periodLabel(inv: InvoiceDto) {
  if (!inv.periodStart || !inv.periodEnd) return "—";
  return `${formatDate(inv.periodStart, "short")} – ${formatDate(inv.periodEnd, "short")}`;
}

/** Download the real server-rendered PDF invoice. */
async function downloadInvoice(inv: InvoiceDto) {
  try {
    await downloadInvoicePdf(inv.id, inv.number);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Couldn't download the invoice.");
  }
}

export default function InvoicesPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["billing", "invoices"], queryFn: getInvoices });
  const invoices = useMemo(() => data ?? [], [data]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [year, setYear] = useState<string>("all");

  const years = useMemo(
    () => Array.from(new Set(invoices.map((i) => new Date(i.issuedAt).getFullYear().toString()))).sort((a, b) => Number(b) - Number(a)),
    [invoices],
  );
  const filtered = useMemo(
    () =>
      invoices.filter((i) => {
        const matchStatus = status === "all" || i.status === status;
        const matchYear = year === "all" || new Date(i.issuedAt).getFullYear().toString() === year;
        return matchStatus && matchYear;
      }),
    [invoices, status, year],
  );

  function downloadAll() {
    if (filtered.length === 0) return toast.error("No invoices match the current filters.");
    filtered.forEach(downloadInvoice);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" description="Download GST-compliant invoices and review your billing history." eyebrow="Account">
        <Button variant="outline" asChild className="group" data-testid="invoices-billing-link">
          <Link href="/app/billing">
            <Icon name="billing" size={16} /> Billing
          </Link>
        </Button>
        <Button variant="gradient" className="group" onClick={downloadAll} data-testid="invoices-download-all-btn">
          <Icon name="download" size={16} className="text-white" /> Download all
        </Button>
      </PageHeader>

      <Card data-testid="invoices-card">
        <CardHeader>
          <CardTitle className="text-base">All invoices</CardTitle>
          <CardDescription>
            {filtered.length} of {invoices.length} invoice{invoices.length === 1 ? "" : "s"}
          </CardDescription>
          <CardAction>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="invoices-year-filter" className="sr-only">
                  Year
                </Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger id="invoices-year-filter" className="w-[120px]" data-testid="invoices-year-filter">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All years</SelectItem>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5">
                <Label htmlFor="invoices-status-filter" className="sr-only">
                  Status
                </Label>
                <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                  <SelectTrigger id="invoices-status-filter" className="w-[140px]" data-testid="invoices-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="past_due">Past due</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardAction>
        </CardHeader>

        <CardContent>
          <QueryBoundary isLoading={isLoading} error={error} onRetry={() => void refetch()}>
            {filtered.length === 0 ? (
              <EmptyState
                icon="invoice"
                title={invoices.length === 0 ? "No invoices yet" : "No invoices found"}
                description={invoices.length === 0 ? "Upgrade to a paid plan and your billing statements will appear here." : "No invoices match your current filters. Try widening the year or status."}
                testId="invoices-empty-state"
              >
                {invoices.length === 0 ? (
                  <Button variant="gradient" asChild className="group" data-testid="invoices-empty-plans-btn">
                    <Link href="/app/billing/plans">
                      <Icon name="rocket" size={16} className="text-white" /> View plans
                    </Link>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStatus("all");
                      setYear("all");
                    }}
                    data-testid="invoices-clear-filters-btn"
                  >
                    Clear filters
                  </Button>
                )}
              </EmptyState>
            ) : (
              <>
                {/* Desktop / tablet table */}
                <div className="hidden overflow-x-auto sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Issued</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((inv) => (
                        <TableRow key={inv.id} data-testid={`invoice-row-${inv.id}`}>
                          <TableCell className="font-mono text-sm font-medium">{inv.number}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{inv.plan}</TableCell>
                          <TableCell className="text-sm text-muted-foreground tabular-nums">{periodLabel(inv)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{formatCurrency(inv.amount)}</TableCell>
                          <TableCell>
                            <StatusBadge status={inv.status} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground tabular-nums">{formatDate(inv.issuedAt)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" className="group" onClick={() => downloadInvoice(inv)} data-testid={`invoice-download-${inv.id}`}>
                              <Icon name="download" size={15} /> Invoice
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile cards */}
                <div className="space-y-3 sm:hidden">
                  {filtered.map((inv) => (
                    <Card key={inv.id} className="p-4" data-testid={`invoice-card-${inv.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono text-sm font-medium">{inv.number}</p>
                          <p className="text-xs text-muted-foreground">{inv.plan}</p>
                        </div>
                        <StatusBadge status={inv.status} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Amount</p>
                          <p className="font-display text-base font-bold tabular-nums">{formatCurrency(inv.amount)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Issued</p>
                          <p className="font-medium tabular-nums">{formatDate(inv.issuedAt)}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-muted-foreground">Period</p>
                          <p className="font-medium tabular-nums">{periodLabel(inv)}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="group mt-3 w-full" onClick={() => downloadInvoice(inv)} data-testid={`invoice-download-mobile-${inv.id}`}>
                        <Icon name="download" size={15} /> Download invoice
                      </Button>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </QueryBoundary>
        </CardContent>

        <CardFooter className="justify-between text-xs text-muted-foreground">
          <span>Invoices are issued in INR and include 18% GST.</span>
          <span className="tabular-nums">
            Showing {filtered.length} of {invoices.length}
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}
