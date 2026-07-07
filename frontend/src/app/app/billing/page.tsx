"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

import { getSubscription } from "@/lib/api/services/subscription";
import { cancelSubscription, getInvoices } from "@/lib/api/services/billing";
import { ApiError } from "@/lib/api/errors";
import { formatCurrency, formatNumber, formatDate, formatPercent } from "@/lib/format";

export default function BillingPage() {
  const qc = useQueryClient();
  const subQ = useQuery({ queryKey: ["subscription"], queryFn: getSubscription });
  const invQ = useQuery({ queryKey: ["billing", "invoices"], queryFn: getInvoices });

  const sub = subQ.data;
  const invoices = invQ.data ?? [];
  const priceMonthly = sub ? sub.plan.price_monthly_paise / 100 : 0;
  const used = sub?.usage.calls_used ?? 0;
  const quota = sub?.usage.included_calls ?? 0;
  const usagePct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
  const remaining = sub?.usage.remaining ?? 0;
  const quotaExhausted = quota > 0 && used >= quota;
  const isFree = sub?.plan.code === "free";

  const cancelM = useMutation({
    mutationFn: () => cancelSubscription(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["subscription"] });
      toast.success("Cancellation scheduled", { description: "Your plan ends at the close of the current cycle." });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't cancel your subscription"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Billing & plans" description="Manage your subscription and review recent invoices." eyebrow="Account">
        <Button variant="outline" asChild data-testid="billing-invoices-link">
          <Link href="/app/billing/invoices" className="group">
            <Icon name="invoice" size={16} /> Invoices
          </Link>
        </Button>
        <Button variant="gradient" asChild data-testid="billing-change-plan-btn">
          <Link href="/app/billing/plans" className="group">
            <Icon name="rocket" size={16} className="text-white" /> Change plan
          </Link>
        </Button>
      </PageHeader>

      <QueryBoundary isLoading={subQ.isLoading} error={subQ.error} onRetry={() => void subQ.refetch()}>
        {sub && (
          <>
            <div className="grid gap-5 lg:grid-cols-3">
              {/* Current plan */}
              <Card className="relative overflow-hidden lg:col-span-2" data-testid="billing-current-plan-card">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="font-display text-xl">{sub.plan.name}</CardTitle>
                    <Badge variant="gradient" data-testid="billing-plan-badge">
                      Current
                    </Badge>
                    {sub.status !== "active" && <StatusBadge status={sub.status} />}
                  </div>
                  <CardDescription>Your active subscription and included usage.</CardDescription>
                  <CardAction>
                    <span className="grid size-11 place-items-center rounded-2xl bg-brand-gradient-soft text-primary">
                      <Icon name="billing" size={22} />
                    </span>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Price</p>
                      <p className="font-display text-3xl font-bold tabular-nums">
                        {formatCurrency(priceMonthly)}
                        <span className="text-base font-medium text-muted-foreground">/mo</span>
                      </p>
                    </div>
                    <Separator orientation="vertical" className="hidden h-12 sm:block" />
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Renews on</p>
                      <p className="mt-1 flex items-center gap-1.5 font-medium tabular-nums">
                        <Icon name="clock" size={15} className="text-muted-foreground" />
                        {formatDate(sub.current_period_end, "long")}
                      </p>
                    </div>
                    <Separator orientation="vertical" className="hidden h-12 sm:block" />
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Included calls</p>
                      <p className="mt-1 font-medium tabular-nums">{formatNumber(sub.plan.included_calls)}/mo</p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  <Button variant="gradient" asChild className="group" data-testid="billing-change-plan-cta">
                    <Link href="/app/billing/plans">
                      <Icon name="trending" size={16} className="text-white" /> Change plan
                    </Link>
                  </Button>
                  {!isFree && <CancelDialog onConfirm={() => cancelM.mutate()} pending={cancelM.isPending} />}
                </CardFooter>
              </Card>

              {/* Quota usage */}
              <Card data-testid="billing-quota-card">
                <CardHeader>
                  <CardTitle className="text-base">Quota usage</CardTitle>
                  <CardDescription>Calls in the current billing cycle.</CardDescription>
                  <CardAction>
                    <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                      <Icon name="gauge" size={18} />
                    </span>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="font-display text-2xl font-bold tabular-nums">{formatNumber(used)}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">/ {formatNumber(quota)}</span>
                    </div>
                    <Progress
                      value={usagePct}
                      className="mt-2"
                      indicatorClassName={usagePct >= 100 ? "bg-destructive" : usagePct >= 80 ? "bg-warning" : undefined}
                      data-testid="billing-quota-progress"
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">{formatPercent(usagePct / 100)} of quota used</p>
                  </div>

                  <Separator />

                  <div className={quotaExhausted ? "rounded-xl bg-destructive/10 p-3" : "rounded-xl bg-muted/50 p-3"} data-testid="billing-quota-status">
                    <div className="flex items-center justify-between">
                      <span className={`flex items-center gap-1.5 text-sm font-medium ${quotaExhausted ? "text-destructive" : ""}`}>
                        <Icon name="trending" size={15} className={quotaExhausted ? "text-destructive" : "text-muted-foreground"} /> Calls remaining
                      </span>
                      <span className={`font-display font-bold tabular-nums ${quotaExhausted ? "text-destructive" : ""}`}>
                        {remaining === -1 ? "Unlimited" : formatNumber(Math.max(0, remaining))}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {quotaExhausted
                        ? "Quota exhausted — API calls are blocked until your quota resets or you upgrade."
                        : "Calls beyond your included quota are blocked, never billed — no surprise charges."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Payment — Razorpay (no stored card) */}
            <Card data-testid="billing-payment-card">
              <CardHeader>
                <CardTitle className="text-base">Payments</CardTitle>
                <CardDescription>How subscription charges are processed.</CardDescription>
                <CardAction>
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                    <Icon name="wallet" size={18} />
                  </span>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4">
                  <span className="grid h-9 w-12 shrink-0 place-items-center rounded-md bg-brand-gradient text-[11px] font-bold text-white">RZP</span>
                  <div className="text-sm">
                    <p className="font-medium">Secured by Razorpay</p>
                    <p className="mt-0.5 text-muted-foreground">
                      You enter card / UPI / netbanking details on Razorpay&apos;s secure checkout when you change plans. Postpin never
                      stores your payment details.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent invoices preview */}
            <Card data-testid="billing-invoices-preview-card">
              <CardHeader>
                <CardTitle className="text-base">Recent invoices</CardTitle>
                <CardDescription>Your most recent billing statements.</CardDescription>
                <CardAction>
                  <Button variant="ghost" size="sm" asChild className="group" data-testid="billing-view-all-invoices-btn">
                    <Link href="/app/billing/invoices">
                      View all <Icon name="arrowRight" size={15} />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <QueryBoundary isLoading={invQ.isLoading} error={invQ.error} onRetry={() => void invQ.refetch()}>
                  {invoices.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No invoices yet. Upgrade to a paid plan to see billing statements here.</p>
                  ) : (
                    <div className="-mx-2 overflow-x-auto sm:mx-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Invoice</TableHead>
                            <TableHead className="hidden sm:table-cell">Issued</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoices.slice(0, 4).map((inv) => (
                            <TableRow key={inv.id} data-testid={`billing-invoice-row-${inv.id}`}>
                              <TableCell className="font-mono text-sm font-medium">{inv.number}</TableCell>
                              <TableCell className="hidden text-sm text-muted-foreground sm:table-cell tabular-nums">{formatDate(inv.issuedAt)}</TableCell>
                              <TableCell className="text-right font-medium tabular-nums">{formatCurrency(inv.amount)}</TableCell>
                              <TableCell className="text-right">
                                <StatusBadge status={inv.status} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </QueryBoundary>
              </CardContent>
            </Card>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}

/* ── Cancel subscription dialog ─────────────────────────────────── */
function CancelDialog({ onConfirm, pending }: { onConfirm: () => void; pending: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" className="group text-muted-foreground" data-testid="billing-cancel-btn">
          <Icon name="close" size={16} /> Cancel plan
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="billing-cancel-dialog">
        <DialogHeader>
          <DialogTitle>Cancel your subscription?</DialogTitle>
          <DialogDescription>
            Your plan stays active until the end of the current cycle. After that you&apos;ll drop to the Free tier and API access
            will be limited.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancel-reason">Tell us why (optional)</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger id="cancel-reason" data-testid="billing-cancel-reason-select">
              <SelectValue placeholder="Choose a reason" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="too-expensive">Too expensive</SelectItem>
              <SelectItem value="missing-features">Missing features</SelectItem>
              <SelectItem value="switching">Switching provider</SelectItem>
              <SelectItem value="not-using">Not using it enough</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" data-testid="billing-cancel-keep-btn">
              Keep my plan
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive" onClick={onConfirm} disabled={pending} data-testid="billing-cancel-confirm-btn">
              Confirm cancellation
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
