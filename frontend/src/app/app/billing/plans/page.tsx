"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import { useSession } from "@/components/providers/session-provider";
import {
  cancelSubscription,
  checkout,
  devCompleteCheckout,
  getBillingPlans,
  openRazorpayCheckout,
  validateCoupon,
  verifyPayment,
  type BillingPlan,
  type CouponInfo,
} from "@/lib/api/services/billing";
import { Input } from "@/components/ui/input";
import { getSubscription } from "@/lib/api/services/subscription";
import { ApiError } from "@/lib/api/errors";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type Interval = "monthly" | "yearly";
type Action = "current" | "upgrade" | "downgrade" | "contact";

function actionFor(plan: BillingPlan, currentCode: string, order: Map<string, number>): Action {
  if (plan.priceMonthly < 0) return "contact";
  if (plan.id === currentCode) return "current";
  return (order.get(plan.id) ?? 0) > (order.get(currentCode) ?? 0) ? "upgrade" : "downgrade";
}

export default function PlansPage() {
  const qc = useQueryClient();
  const { user } = useSession();
  const [interval, setInterval] = useState<Interval>("monthly");
  const [selected, setSelected] = useState<BillingPlan | null>(null);

  const plansQ = useQuery({ queryKey: ["billing", "plans"], queryFn: getBillingPlans });
  const subQ = useQuery({ queryKey: ["subscription"], queryFn: getSubscription });
  const plans = plansQ.data ?? [];
  const currentCode = subQ.data?.plan.code ?? "free";
  const order = useMemo(() => new Map(plans.map((p, i) => [p.id, i])), [plans]);

  const checkoutM = useMutation({
    mutationFn: async ({ plan, couponCode }: { plan: BillingPlan; couponCode?: string }) => {
      // Downgrade to Free = cancel at period end (no payment).
      if (plan.priceMonthly <= 0) {
        await cancelSubscription();
        return { downgraded: true as const, name: plan.name };
      }
      const co = await checkout(plan.id, interval, couponCode);
      if (co.dev_mode) {
        await devCompleteCheckout(co.order_id);
      } else {
        const res = await openRazorpayCheckout(co, { name: user?.name ?? "", email: user?.email ?? "" });
        await verifyPayment(res.razorpay_order_id, res.razorpay_payment_id, res.razorpay_signature);
      }
      return { downgraded: false as const, name: plan.name };
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["subscription"] });
      void qc.invalidateQueries({ queryKey: ["billing"] });
      setSelected(null);
      if (r.downgraded) {
        toast.success("Downgrade scheduled", { description: "You'll move to Free at the end of your current cycle." });
      } else {
        toast.success(`You're on the ${r.name} plan`, { description: "New limits apply immediately. An invoice has been issued." });
      }
    },
    onError: (e) => {
      if (e instanceof Error && e.message === "Checkout cancelled") return; // user closed the modal
      toast.error(e instanceof ApiError ? e.message : "Checkout couldn't be completed. Please try again.");
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Plans & pricing" description="Pick the plan that fits your shipping volume. Prices exclude 18% GST." eyebrow="Account">
        <Button variant="outline" asChild className="group" data-testid="plans-back-btn">
          <Link href="/app/billing">
            <Icon name="arrowRight" size={16} className="rotate-180" /> Back to billing
          </Link>
        </Button>
      </PageHeader>

      {/* Interval toggle */}
      <div className="flex flex-col items-center gap-3">
        <div className="inline-flex items-center rounded-full border border-border bg-muted/50 p-1" role="tablist" aria-label="Billing interval" data-testid="plans-interval-toggle">
          {(["monthly", "yearly"] as const).map((it) => (
            <button
              key={it}
              role="tab"
              aria-selected={interval === it}
              onClick={() => setInterval(it)}
              className={cn(
                "relative rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                interval === it ? "bg-brand-gradient text-white shadow-glow" : "text-muted-foreground hover:text-foreground",
              )}
              data-testid={`plans-interval-${it}-btn`}
            >
              {it}
              {it === "yearly" && (
                <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold", interval === "yearly" ? "bg-white/20 text-white" : "bg-success/15 text-success")}>
                  2 months free
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <QueryBoundary isLoading={plansQ.isLoading || subQ.isLoading} error={plansQ.error ?? subQ.error} onRetry={() => void plansQ.refetch()}>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          {plans.map((plan) => {
            const action = actionFor(plan, currentCode, order);
            const isCurrent = action === "current";
            const isContact = action === "contact";
            const price = interval === "monthly" ? plan.priceMonthly : plan.priceYearly;

            return (
              <Card
                key={plan.id}
                className={cn("relative flex flex-col", plan.highlight && "border-primary/40 shadow-glow", isCurrent && "ring-2 ring-primary")}
                data-testid={`plans-card-${plan.id}`}
              >
                {plan.highlight && <div className="pointer-events-none absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-brand-gradient" />}
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="font-display text-lg">{plan.name}</CardTitle>
                    {isCurrent ? <Badge variant="gradient">Current</Badge> : plan.badge && <Badge variant="muted">{plan.badge}</Badge>}
                  </div>
                  <CardDescription>{plan.tagline}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <div>
                    {isContact ? (
                      <p className="font-display text-2xl font-bold">Custom</p>
                    ) : (
                      <p className="font-display text-3xl font-bold tabular-nums">
                        {formatCurrency(price)}
                        <span className="text-sm font-medium text-muted-foreground">/mo</span>
                      </p>
                    )}
                    {!isContact && interval === "yearly" && price > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">Billed {formatCurrency(price * 12)} / year</p>
                    )}
                    {!isContact && (
                      <p className="mt-1 text-xs font-medium text-primary tabular-nums">
                        {plan.includedCalls < 0 ? "Custom volume" : `${formatNumber(plan.includedCalls)} calls / mo`}
                      </p>
                    )}
                  </div>

                  <Separator />

                  <ul className="space-y-2 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Icon name="checkCircle" size={15} className="mt-0.5 shrink-0 text-success" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {isContact ? (
                    <Button variant="outline" className="group w-full" asChild data-testid={`plans-contact-btn-${plan.id}`}>
                      <Link href="/app/support/new">
                        <Icon name="headphones" size={16} /> Talk to sales
                      </Link>
                    </Button>
                  ) : isCurrent ? (
                    <Button variant="secondary" className="w-full" disabled data-testid={`plans-current-btn-${plan.id}`}>
                      <Icon name="check" size={16} /> Current plan
                    </Button>
                  ) : (
                    <Button
                      variant={action === "upgrade" ? "gradient" : "outline"}
                      className="group w-full"
                      onClick={() => setSelected(plan)}
                      data-testid={`plans-${action}-btn-${plan.id}`}
                    >
                      <Icon name={action === "upgrade" ? "rocket" : "arrowRight"} size={16} className={action === "upgrade" ? "text-white" : undefined} />
                      {action === "upgrade" ? "Upgrade" : "Downgrade"}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </QueryBoundary>

      <CheckoutDialog
        plan={selected}
        interval={interval}
        currentCode={currentCode}
        order={order}
        pending={checkoutM.isPending}
        onConfirm={(couponCode) => selected && checkoutM.mutate({ plan: selected, couponCode })}
        onClose={() => !checkoutM.isPending && setSelected(null)}
      />
    </div>
  );
}

/* ── Checkout dialog ────────────────────────────────────────────── */
function CheckoutDialog({
  plan,
  interval,
  currentCode,
  order,
  pending,
  onConfirm,
  onClose,
}: {
  plan: BillingPlan | null;
  interval: Interval;
  currentCode: string;
  order: Map<string, number>;
  pending: boolean;
  onConfirm: (couponCode?: string) => void;
  onClose: () => void;
}) {
  const open = plan !== null;
  const action = plan ? actionFor(plan, currentCode, order) : "upgrade";
  const toFree = plan ? plan.priceMonthly <= 0 : false;

  const [couponInput, setCouponInput] = useState("");
  const [applied, setApplied] = useState<CouponInfo | null>(null);
  const [applying, setApplying] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Reset coupon state whenever the selected plan changes.
  const planKey = plan?.id ?? "";
  useEffect(() => {
    setCouponInput("");
    setApplied(null);
    setCouponError(null);
  }, [planKey, interval]);

  // Mirror the backend's integer-paise math exactly (GST_BPS on the discounted
  // base) so the dialog never drifts a paise from the issued invoice.
  const summary = useMemo(() => {
    if (!plan || toFree) return null;
    const basePaise = Math.round((interval === "monthly" ? plan.priceMonthly : plan.priceYearly * 12) * 100);
    const discountPaise = applied?.discount_paise ?? 0;
    const discountedPaise = Math.max(0, basePaise - discountPaise);
    const gstPaise = Math.round((discountedPaise * 1800) / 10_000);
    return {
      billed: basePaise / 100,
      discount: discountPaise / 100,
      gst: gstPaise / 100,
      total: (discountedPaise + gstPaise) / 100,
    };
  }, [plan, interval, toFree, applied]);

  async function applyCoupon() {
    if (!plan) return;
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setApplying(true);
    setCouponError(null);
    try {
      const info = await validateCoupon(code, plan.id, interval);
      setApplied(info);
      toast.success(`Coupon ${info.code} applied`, { description: info.description });
    } catch (e) {
      setApplied(null);
      setCouponError(e instanceof ApiError ? e.message : "That coupon isn't valid.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="plans-checkout-dialog">
        {plan && (
          <>
            <DialogHeader>
              <DialogTitle>
                {toFree ? "Downgrade to Free" : action === "upgrade" ? "Upgrade" : "Switch"} to {plan.name}
              </DialogTitle>
              <DialogDescription>
                {toFree
                  ? "Your paid plan stays active until the end of the current cycle, then drops to Free."
                  : action === "upgrade"
                    ? "Effective immediately — you'll be charged today."
                    : "Takes effect at the start of your next billing cycle."}
              </DialogDescription>
            </DialogHeader>

            {summary && (
              <>
                {/* Coupon */}
                <div className="space-y-1.5">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      placeholder="Coupon code"
                      value={couponInput}
                      onChange={(e) => {
                        setCouponInput(e.target.value);
                        if (couponError) setCouponError(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                      disabled={applied !== null}
                      className="font-mono uppercase"
                      data-testid="plans-coupon-input"
                    />
                    {applied ? (
                      <Button
                        variant="outline"
                        className="shrink-0"
                        onClick={() => {
                          setApplied(null);
                          setCouponInput("");
                        }}
                        data-testid="plans-coupon-remove-btn"
                      >
                        Remove
                      </Button>
                    ) : (
                      <Button variant="secondary" className="group shrink-0" onClick={applyCoupon} disabled={applying || !couponInput.trim()} data-testid="plans-coupon-apply-btn">
                        <Icon name="tag" size={16} /> {applying ? "Checking…" : "Apply"}
                      </Button>
                    )}
                  </div>
                  {couponError && (
                    <p className="text-xs text-destructive" data-testid="plans-coupon-error">
                      {couponError}
                    </p>
                  )}
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
                  <Row label={`${plan.name} plan (${interval})`} value={formatCurrency(summary.billed)} />
                  {summary.discount > 0 && <Row label={`Coupon ${applied?.code}`} value={`− ${formatCurrency(summary.discount)}`} muted />}
                  <Row label="GST (18%)" value={formatCurrency(summary.gst)} muted />
                  <Separator />
                  <Row label="Total due today" value={formatCurrency(summary.total)} strong />
                </div>
              </>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={pending} data-testid="plans-checkout-cancel-btn">
                Cancel
              </Button>
              <Button variant="gradient" className="group" onClick={() => onConfirm(applied?.code)} disabled={pending} data-testid="plans-checkout-confirm-btn">
                <Icon name="checkCircle" size={16} className="text-white" />
                {pending ? "Processing…" : toFree ? "Confirm downgrade" : "Confirm & pay"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn(muted && "text-muted-foreground", strong && "font-semibold")}>{label}</span>
      <span className={cn("tabular-nums", muted && "text-muted-foreground", strong && "font-display text-base font-bold")}>{value}</span>
    </div>
  );
}
