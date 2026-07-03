"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { CopyButton } from "@/components/shared/copy-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  createAdminCoupon,
  listAdminCoupons,
  listAdminPlans,
  updateAdminCoupon,
  type AdminCoupon,
  type AdminPlan,
} from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";
import { formatCurrency, formatNumber, formatDate } from "@/lib/format";

/* ── Local working model ─────────────────────────────────────────── */
type DiscountType = AdminCoupon["discount_type"];
type StatusFilter = "all" | AdminCoupon["status"];
type TypeFilter = "all" | DiscountType;

type CouponDraft = {
  code: string;
  discountType: DiscountType;
  value: number;
  appliesTo: string[] | "all";
  maxRedemptions: number | null;
  validUntil: string | null; // yyyy-mm-dd
};

const TYPE_LABEL: Record<DiscountType, string> = {
  percent: "Percent off",
  flat: "Flat off",
  free_months: "Free months",
};

const TYPE_BADGE: Record<DiscountType, "info" | "success" | "gradient"> = {
  percent: "gradient",
  flat: "success",
  free_months: "info",
};

/** Render a coupon value formatted by its discount type. */
function formatCouponValue(type: DiscountType, value: number) {
  switch (type) {
    case "percent":
      return `${value}%`;
    case "flat":
      return formatCurrency(value);
    case "free_months":
      return `${value} month${value === 1 ? "" : "s"}`;
  }
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function emptyDraft(): CouponDraft {
  return {
    code: "",
    discountType: "percent",
    value: 10,
    appliesTo: "all",
    maxRedemptions: null,
    validUntil: null,
  };
}

function draftFromCoupon(c: AdminCoupon): CouponDraft {
  return {
    code: c.code,
    discountType: c.discount_type,
    value: c.value,
    appliesTo: c.applies_to_plan_codes.length > 0 ? [...c.applies_to_plan_codes] : "all",
    maxRedemptions: c.max_redemptions,
    validUntil: c.valid_until ? toDateInput(c.valid_until) : null,
  };
}

/* ── Coupon builder dialog (create + edit limits) ────────────────── */
function CouponBuilder({
  trigger,
  plans,
  initial,
  onSubmit,
}: {
  trigger: React.ReactNode;
  plans: AdminPlan[];
  initial?: AdminCoupon;
  onSubmit: (draft: CouponDraft) => Promise<unknown>;
}) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [draft, setDraft] = React.useState<CouponDraft>(emptyDraft);
  const editing = Boolean(initial);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setDraft(initial ? draftFromCoupon(initial) : emptyDraft());
  }

  const codeValid = /^[A-Z0-9]{3,24}$/.test(draft.code.trim());
  const valueValid =
    draft.discountType === "percent"
      ? draft.value >= 1 && draft.value <= 100
      : draft.discountType === "flat"
        ? draft.value > 0
        : Number.isInteger(draft.value) && draft.value >= 1 && draft.value <= 12;
  const planValid = draft.appliesTo === "all" || draft.appliesTo.length > 0;
  const maxValid =
    draft.maxRedemptions === null ||
    (Number.isInteger(draft.maxRedemptions) && draft.maxRedemptions >= 1);
  const valid = editing ? maxValid : codeValid && valueValid && planValid && maxValid;

  function patch<K extends keyof CouponDraft>(key: K, val: CouponDraft[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  function togglePlan(code: string, checked: boolean) {
    setDraft((d) => {
      const current = d.appliesTo === "all" ? [] : [...d.appliesTo];
      const next = checked ? [...current, code] : current.filter((p) => p !== code);
      return { ...d, appliesTo: next };
    });
  }

  async function handleSubmit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ ...draft, code: draft.code.trim().toUpperCase() });
      setOpen(false);
    } catch {
      // Error toast comes from the mutation's onError — keep the dialog open.
    } finally {
      setSubmitting(false);
    }
  }

  const valueLabel =
    draft.discountType === "percent"
      ? "Discount percentage"
      : draft.discountType === "flat"
        ? "Discount amount (₹)"
        : "Free months";

  const valueError =
    draft.discountType === "percent"
      ? "Enter a percentage between 1 and 100."
      : draft.discountType === "flat"
        ? "Enter an amount greater than ₹0."
        : "Enter between 1 and 12 whole months.";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        data-testid="coupon-builder-dialog"
      >
        <DialogHeader>
          <DialogTitle>{editing ? "Edit coupon" : "Create coupon"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Code, discount and eligibility are locked after creation — adjust the redemption cap and expiry here."
              : "Configure the discount, eligibility and validity window. Codes are uppercased and must be unique."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Code + type */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="coupon-code">Coupon code</Label>
              <Input
                id="coupon-code"
                placeholder="WELCOME20"
                value={draft.code}
                disabled={editing}
                onChange={(e) => patch("code", e.target.value.toUpperCase())}
                className="font-mono uppercase tracking-wide"
                data-testid="coupon-code-input"
              />
              {!editing && (
                <p
                  className={`text-xs ${draft.code && !codeValid ? "text-destructive" : "text-muted-foreground"}`}
                >
                  3–24 characters, A–Z and 0–9 only.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coupon-type">Discount type</Label>
              <Select
                value={draft.discountType}
                disabled={editing}
                onValueChange={(v) => patch("discountType", v as DiscountType)}
              >
                <SelectTrigger id="coupon-type" data-testid="coupon-type-select">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent" data-testid="coupon-type-percent">
                    Percent off
                  </SelectItem>
                  <SelectItem value="flat" data-testid="coupon-type-flat">
                    Flat amount off
                  </SelectItem>
                  <SelectItem value="free_months" data-testid="coupon-type-free-months">
                    Free months
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Value */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="coupon-value">{valueLabel}</Label>
              <Input
                id="coupon-value"
                type="number"
                min={1}
                max={
                  draft.discountType === "percent"
                    ? 100
                    : draft.discountType === "free_months"
                      ? 12
                      : undefined
                }
                value={draft.value}
                disabled={editing}
                onChange={(e) => patch("value", Number(e.target.value))}
                className="font-mono tabular-nums"
                data-testid="coupon-value-input"
              />
              {!editing && !valueValid && <p className="text-xs text-destructive">{valueError}</p>}
            </div>
          </div>

          {/* Applies to */}
          <div className="space-y-2">
            <Label>Applies to</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={draft.appliesTo === "all" ? "gradient" : "outline"}
                disabled={editing}
                onClick={() => patch("appliesTo", "all")}
                data-testid="coupon-applies-all-btn"
              >
                All plans
              </Button>
              <Button
                type="button"
                size="sm"
                variant={draft.appliesTo !== "all" ? "gradient" : "outline"}
                disabled={editing}
                onClick={() => patch("appliesTo", [])}
                data-testid="coupon-applies-specific-btn"
              >
                Specific plans
              </Button>
            </div>
            {draft.appliesTo !== "all" && (
              <div
                className="grid gap-2 rounded-xl border border-border bg-card/40 p-3 sm:grid-cols-2"
                data-testid="coupon-plans-multiselect"
              >
                {plans.map((p) => {
                  const checked = draft.appliesTo !== "all" && draft.appliesTo.includes(p.code);
                  return (
                    <label
                      key={p.code}
                      htmlFor={`coupon-plan-${p.code}`}
                      className="flex cursor-pointer items-center gap-2.5 text-sm"
                    >
                      <Checkbox
                        id={`coupon-plan-${p.code}`}
                        checked={checked}
                        disabled={editing}
                        onCheckedChange={(c) => togglePlan(p.code, Boolean(c))}
                        data-testid={`coupon-plan-checkbox-${p.code}`}
                      />
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
                        {p.price_monthly === 0 ? "Custom" : formatCurrency(p.price_monthly)}
                      </span>
                    </label>
                  );
                })}
                {plans.length === 0 && (
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Plans are unavailable right now — try again shortly or use “All plans”.
                  </p>
                )}
                {!planValid && plans.length > 0 && (
                  <p className="text-xs text-destructive sm:col-span-2">
                    Select at least one plan.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Limits + expiry */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="coupon-max">Max redemptions</Label>
              <Input
                id="coupon-max"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={draft.maxRedemptions ?? ""}
                onChange={(e) =>
                  patch("maxRedemptions", e.target.value === "" ? null : Number(e.target.value))
                }
                className="font-mono tabular-nums"
                data-testid="coupon-max-redemptions-input"
              />
              <p className={`text-xs ${maxValid ? "text-muted-foreground" : "text-destructive"}`}>
                {maxValid ? "Blank = unlimited." : "Enter a whole number of 1 or more."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coupon-expiry">Expiry date</Label>
              <Input
                id="coupon-expiry"
                type="date"
                value={draft.validUntil ?? ""}
                onChange={(e) => patch("validUntil", e.target.value === "" ? null : e.target.value)}
                data-testid="coupon-expiry-date-input"
              />
              <p className="text-xs text-muted-foreground">Blank = never expires.</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            data-testid="coupon-builder-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            variant="gradient"
            disabled={!valid || submitting}
            onClick={() => void handleSubmit()}
            data-testid="coupon-builder-submit-btn"
          >
            {submitting ? "Saving…" : editing ? "Save changes" : "Create coupon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Row actions ─────────────────────────────────────────────────── */
function RowActions({
  coupon,
  plans,
  onEdit,
  onSetStatus,
}: {
  coupon: AdminCoupon;
  plans: AdminPlan[];
  onEdit: (coupon: AdminCoupon, draft: CouponDraft) => Promise<unknown>;
  onSetStatus: (coupon: AdminCoupon, status: "active" | "paused") => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="group"
          aria-label={`Actions for ${coupon.code}`}
          data-testid={`coupon-row-actions-${coupon.id}`}
        >
          <Icon name="more" trigger="group-hover" size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Manage coupon</DropdownMenuLabel>
        <CouponBuilder
          initial={coupon}
          plans={plans}
          onSubmit={(draft) => onEdit(coupon, draft)}
          trigger={
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              data-testid={`coupon-action-edit-${coupon.id}`}
            >
              <Icon name="edit" size={16} /> Edit limits
            </DropdownMenuItem>
          }
        />
        <DropdownMenuItem
          onSelect={() => {
            navigator.clipboard?.writeText(coupon.code);
            toast.success("Coupon code copied");
          }}
          data-testid={`coupon-action-copy-${coupon.id}`}
        >
          <Icon name="copy" size={16} /> Copy code
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {coupon.status === "active" && (
          <ConfirmDialog
            trigger={
              <DropdownMenuItem
                variant="destructive"
                onSelect={(e) => e.preventDefault()}
                data-testid={`coupon-action-pause-${coupon.id}`}
              >
                <Icon name="lock" size={16} /> Pause
              </DropdownMenuItem>
            }
            title={`Pause "${coupon.code}"?`}
            description="The coupon stops accepting new redemptions immediately. Existing subscribers keep any active discount. You can resume it anytime."
            confirmLabel="Pause coupon"
            destructive
            onConfirm={() => onSetStatus(coupon, "paused")}
            testId={`coupon-pause-dialog-${coupon.id}`}
          />
        )}
        {coupon.status === "paused" && (
          <ConfirmDialog
            trigger={
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                data-testid={`coupon-action-resume-${coupon.id}`}
              >
                <Icon name="checkCircle" size={16} /> Resume
              </DropdownMenuItem>
            }
            title={`Resume "${coupon.code}"?`}
            description="The coupon starts accepting new redemptions again immediately."
            confirmLabel="Resume coupon"
            onConfirm={() => onSetStatus(coupon, "active")}
            testId={`coupon-resume-dialog-${coupon.id}`}
          />
        )}
        {coupon.status === "expired" && (
          <DropdownMenuItem disabled data-testid={`coupon-action-resume-${coupon.id}`}>
            <Icon name="checkCircle" size={16} />
            <span className="flex flex-col items-start">
              <span>Resume</span>
              <span className="text-xs text-muted-foreground">
                Expired coupons can&apos;t be resumed
              </span>
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Redemption cell (mini progress) ─────────────────────────────── */
function RedemptionCell({ coupon }: { coupon: AdminCoupon }) {
  const pct = coupon.max_redemptions
    ? Math.min(100, Math.round((coupon.redemption_count / coupon.max_redemptions) * 100))
    : null;
  return (
    <div className="min-w-[7.5rem] space-y-1.5">
      <p className="font-mono text-xs tabular-nums">
        {formatNumber(coupon.redemption_count)}
        <span className="text-muted-foreground">
          {" / "}
          {coupon.max_redemptions ? formatNumber(coupon.max_redemptions) : "∞"}
        </span>
      </p>
      {pct !== null ? (
        <Progress
          value={pct}
          className="h-1.5"
          data-testid={`coupon-redemptions-progress-${coupon.id}`}
        />
      ) : (
        <p className="text-[11px] text-muted-foreground">Unlimited</p>
      )}
    </div>
  );
}

function ScheduleCell({ coupon }: { coupon: AdminCoupon }) {
  const until = coupon.valid_until ? formatDate(coupon.valid_until, "short") : "No expiry";
  return (
    <span
      className="whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums"
      data-testid={`coupon-validity-${coupon.id}`}
    >
      {coupon.valid_from ? `${formatDate(coupon.valid_from, "short")} – ${until}` : until}
    </span>
  );
}

function AppliesToCell({
  coupon,
  planNames,
}: {
  coupon: AdminCoupon;
  planNames: Map<string, string>;
}) {
  if (coupon.applies_to_plan_codes.length === 0) {
    return <span className="text-sm text-muted-foreground">All plans</span>;
  }
  return (
    <div className="flex flex-wrap gap-1" data-testid={`coupon-applies-${coupon.id}`}>
      {coupon.applies_to_plan_codes.map((code) => (
        <Badge key={code} variant="outline" className="font-normal">
          {planNames.get(code) ?? code}
        </Badge>
      ))}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function CouponsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [query, setQuery] = React.useState("");

  const couponsQ = useQuery({ queryKey: ["admin", "coupons"], queryFn: listAdminCoupons });
  const plansQ = useQuery({ queryKey: ["admin", "plans"], queryFn: listAdminPlans });

  const coupons = couponsQ.data ?? [];
  const paidPlans = React.useMemo(
    () => (plansQ.data ?? []).filter((p) => p.code !== "free"),
    [plansQ.data],
  );
  const planNames = React.useMemo(
    () => new Map((plansQ.data ?? []).map((p) => [p.code, p.name] as const)),
    [plansQ.data],
  );

  const createM = useMutation({
    mutationFn: (draft: CouponDraft) =>
      createAdminCoupon({
        code: draft.code,
        discount_type: draft.discountType,
        value: draft.value,
        applies_to_plan_codes: draft.appliesTo === "all" ? [] : draft.appliesTo,
        max_redemptions: draft.maxRedemptions,
        valid_until: draft.validUntil ? new Date(draft.validUntil).toISOString() : null,
      }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
      toast.success(`Coupon ${c.code} created`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't create the coupon"),
  });

  const editM = useMutation({
    mutationFn: ({ coupon, draft }: { coupon: AdminCoupon; draft: CouponDraft }) =>
      updateAdminCoupon(coupon.id, {
        max_redemptions: draft.maxRedemptions,
        valid_until: draft.validUntil ? new Date(draft.validUntil).toISOString() : null,
      }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
      toast.success(`Coupon ${c.code} updated`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't update the coupon"),
  });

  const statusM = useMutation({
    mutationFn: ({ coupon, status }: { coupon: AdminCoupon; status: "active" | "paused" }) =>
      updateAdminCoupon(coupon.id, { status }),
    onSuccess: (c, vars) => {
      void qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
      toast.success(`Coupon ${c.code} ${vars.status === "paused" ? "paused" : "resumed"}`);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn't update the coupon status"),
  });

  const handleCreate = (draft: CouponDraft) => createM.mutateAsync(draft);
  const handleEdit = (coupon: AdminCoupon, draft: CouponDraft) =>
    editM.mutateAsync({ coupon, draft });
  const handleSetStatus = (coupon: AdminCoupon, status: "active" | "paused") =>
    statusM.mutate({ coupon, status });

  const filtered = coupons.filter((c) => {
    const statusOk = statusFilter === "all" || c.status === statusFilter;
    const typeOk = typeFilter === "all" || c.discount_type === typeFilter;
    const q = query.trim().toLowerCase();
    const queryOk = q === "" || c.code.toLowerCase().includes(q);
    return statusOk && typeOk && queryOk;
  });

  const totalRedemptions = coupons.reduce((a, c) => a + c.redemption_count, 0);
  const activeCount = coupons.filter((c) => c.status === "active").length;
  const capped = coupons.filter((c) => c.max_redemptions !== null);
  const totalCapacity = capped.reduce((a, c) => a + (c.max_redemptions ?? 0), 0);
  const cappedRedemptions = capped.reduce((a, c) => a + c.redemption_count, 0);
  const capacityUsedPct =
    totalCapacity > 0 ? Math.round((cappedRedemptions / totalCapacity) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tenants"
        title="Coupons"
        description="Build promotional codes — percentage, flat and free-month discounts — with caps, eligibility and validity windows."
      >
        <CouponBuilder
          plans={paidPlans}
          onSubmit={handleCreate}
          trigger={
            <Button variant="gradient" className="group" data-testid="coupon-create-btn">
              <Icon name="plus" trigger="group-hover" size={16} className="text-white" />
              Create coupon
            </Button>
          }
        />
      </PageHeader>

      <QueryBoundary
        isLoading={couponsQ.isLoading}
        error={couponsQ.error}
        onRetry={() => void couponsQ.refetch()}
      >
        {/* Redemptions summary stat row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total redemptions"
            value={formatNumber(totalRedemptions)}
            icon="tag"
            hint="Across all coupons"
            testId="coupon-stat-redemptions"
          />
          <StatCard
            label="Active coupons"
            value={formatNumber(activeCount)}
            icon="percent"
            hint={`${coupons.length} total`}
            testId="coupon-stat-active"
          />
          <StatCard
            label="Redemption capacity"
            value={totalCapacity > 0 ? `${capacityUsedPct}%` : "∞"}
            icon="gauge"
            hint={
              totalCapacity > 0
                ? `${formatNumber(cappedRedemptions)} of ${formatNumber(totalCapacity)} capped redemptions used`
                : "No redemption caps set"
            }
            testId="coupon-stat-capacity"
          />
          <StatCard
            label="Plans covered"
            value={plansQ.data ? formatNumber(paidPlans.length) : "—"}
            icon="billing"
            hint="Eligible paid plans"
            testId="coupon-stat-plans"
          />
        </div>

        {/* Controls */}
        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Icon name="search" size={16} />
            </span>
            <Input
              placeholder="Search by code"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 font-mono"
              data-testid="coupon-search-input"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
              <SelectTrigger className="w-full sm:w-44" data-testid="coupon-type-filter">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="percent">Percent off</SelectItem>
                <SelectItem value="flat">Flat off</SelectItem>
                <SelectItem value="free_months">Free months</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="w-full sm:w-44" data-testid="coupon-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-6">
          {filtered.length === 0 ? (
            <EmptyState
              icon="tag"
              title={coupons.length === 0 ? "No coupons yet" : "No coupons match your filters"}
              description={
                coupons.length === 0
                  ? "Create your first promotion to reward signups and drive plan upgrades."
                  : "Try a different type or status, or clear your search."
              }
              testId="coupon-empty-state"
            >
              {coupons.length === 0 ? (
                <CouponBuilder
                  plans={paidPlans}
                  onSubmit={handleCreate}
                  trigger={
                    <Button
                      variant="gradient"
                      className="group"
                      data-testid="coupon-empty-create-btn"
                    >
                      <Icon name="plus" trigger="group-hover" size={16} className="text-white" />
                      Create coupon
                    </Button>
                  }
                />
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                    setTypeFilter("all");
                  }}
                  data-testid="coupon-clear-filters-btn"
                >
                  Clear filters
                </Button>
              )}
            </EmptyState>
          ) : (
            <>
              {/* Desktop / tablet table */}
              <Card className="hidden overflow-x-auto p-0 md:block" data-testid="coupon-table">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Redemptions</TableHead>
                      <TableHead>Applies to</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => (
                      <TableRow key={c.id} className="group" data-testid={`coupon-row-${c.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code
                              className={`font-mono text-sm font-medium ${c.status === "expired" ? "text-muted-foreground line-through" : ""}`}
                              data-testid={`coupon-code-${c.id}`}
                            >
                              {c.code}
                            </code>
                            <CopyButton
                              value={c.code}
                              testId={`coupon-copy-btn-${c.id}`}
                              toastMessage="Coupon code copied"
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={TYPE_BADGE[c.discount_type]}
                            data-testid={`coupon-type-badge-${c.id}`}
                          >
                            {TYPE_LABEL[c.discount_type]}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="font-mono text-sm tabular-nums"
                          data-testid={`coupon-value-${c.id}`}
                        >
                          {formatCouponValue(c.discount_type, c.value)}
                        </TableCell>
                        <TableCell>
                          <RedemptionCell coupon={c} />
                        </TableCell>
                        <TableCell className="max-w-[12rem]">
                          <AppliesToCell coupon={c} planNames={planNames} />
                        </TableCell>
                        <TableCell>
                          <ScheduleCell coupon={c} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={c.status} testId={`coupon-status-badge-${c.id}`} />
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            coupon={c}
                            plans={paidPlans}
                            onEdit={handleEdit}
                            onSetStatus={handleSetStatus}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              {/* Mobile cards */}
              <div className="grid gap-3 md:hidden">
                {filtered.map((c) => (
                  <Card key={c.id} className="group p-4" data-testid={`coupon-card-${c.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <code
                            className={`font-mono text-sm font-medium ${c.status === "expired" ? "text-muted-foreground line-through" : ""}`}
                          >
                            {c.code}
                          </code>
                          <CopyButton
                            value={c.code}
                            testId={`coupon-card-copy-btn-${c.id}`}
                            toastMessage="Coupon code copied"
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant={TYPE_BADGE[c.discount_type]}>
                            {TYPE_LABEL[c.discount_type]}
                          </Badge>
                          <StatusBadge status={c.status} />
                        </div>
                      </div>
                      <RowActions
                        coupon={c}
                        plans={paidPlans}
                        onEdit={handleEdit}
                        onSetStatus={handleSetStatus}
                      />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Value</dt>
                        <dd className="font-mono tabular-nums">
                          {formatCouponValue(c.discount_type, c.value)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Applies to</dt>
                        <dd className="truncate">
                          <AppliesToCell coupon={c} planNames={planNames} />
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs text-muted-foreground">Schedule</dt>
                        <dd>
                          <ScheduleCell coupon={c} />
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3">
                      <RedemptionCell coupon={c} />
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </QueryBoundary>
    </div>
  );
}
