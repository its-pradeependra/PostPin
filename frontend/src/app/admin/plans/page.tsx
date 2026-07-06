"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { createAdminPlan, listAdminPlans, updateAdminPlan, type AdminPlan } from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";
import { formatCurrency, formatNumber, formatCompact } from "@/lib/format";

type PlanPatch = Parameters<typeof updateAdminPlan>[1];

/** -1 price means custom / talk-to-sales. */
function priceLabel(value: number) {
  if (value < 0) return "Custom";
  if (value === 0) return "Free";
  return formatCurrency(value, "INR", { maximumFractionDigits: 0 });
}

/** -1 included calls means unlimited. */
function callsLabel(value: number) {
  if (value < 0) return "Unlimited";
  return formatNumber(value);
}

function callsCompactLabel(value: number) {
  if (value < 0) return "Unlimited";
  return formatCompact(value);
}

/** -1 on max_api_keys / max_team_members means unlimited. */
function limitLabel(value: number) {
  if (value < 0) return "Unlimited";
  return formatNumber(value);
}

/** null overage means requests over quota are hard-blocked. */
function overageLabel(value: number | null) {
  if (value === null) return "Hard block";
  return formatCurrency(value, "INR", { maximumFractionDigits: 0 });
}

function PublicBadge({ plan }: { plan: AdminPlan }) {
  return (
    <Badge
      variant={plan.is_public ? "info" : "muted"}
      data-testid={`plan-public-badge-${plan.code}`}
    >
      {plan.is_public ? "Public" : "Hidden"}
    </Badge>
  );
}

// ── Editor form state ──────────────────────────────────────────────
interface EditorState {
  code: string;
  name: string;
  description: string;
  priceMonthly: string;
  priceYearly: string;
  includedCalls: string;
  /** Empty string = null = hard block over quota. */
  overagePer1k: string;
  rateLimitRpm: string;
  maxApiKeys: string;
  maxTeamMembers: string;
  features: string[];
  isActive: boolean;
  isPublic: boolean;
}

function emptyEditor(): EditorState {
  return {
    code: "",
    name: "",
    description: "",
    priceMonthly: "0",
    priceYearly: "0",
    includedCalls: "0",
    overagePer1k: "",
    rateLimitRpm: "60",
    maxApiKeys: "1",
    maxTeamMembers: "1",
    features: [],
    isActive: true,
    isPublic: false,
  };
}

function editorFromPlan(p: AdminPlan): EditorState {
  return {
    code: p.code,
    name: p.name,
    description: p.description,
    priceMonthly: String(p.price_monthly),
    priceYearly: String(p.price_yearly),
    includedCalls: String(p.included_calls),
    overagePer1k: p.overage_per_1k === null ? "" : String(p.overage_per_1k),
    rateLimitRpm: String(p.rate_limit_rpm),
    maxApiKeys: String(p.max_api_keys),
    maxTeamMembers: String(p.max_team_members),
    features: [...p.features],
    isActive: p.is_active,
    isPublic: p.is_public,
  };
}

export default function AdminPlansPage() {
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingCode, setEditingCode] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<EditorState>(emptyEditor);
  const [featureDraft, setFeatureDraft] = React.useState("");

  const plansQ = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: listAdminPlans,
  });

  const plans = React.useMemo(
    () => [...(plansQ.data ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [plansQ.data],
  );

  const saveM = useMutation({
    mutationFn: ({ code, patch }: { code: string; patch: PlanPatch }) =>
      updateAdminPlan(code, patch),
    onSuccess: (plan) => {
      void qc.invalidateQueries({ queryKey: ["admin", "plans"] });
      toast.success(`Plan “${plan.name}” updated.`);
      setEditorOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save the plan"),
  });

  const createM = useMutation({
    mutationFn: createAdminPlan,
    onSuccess: (plan) => {
      void qc.invalidateQueries({ queryKey: ["admin", "plans"] });
      toast.success(`Plan “${plan.name}” created.`);
      setEditorOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't create the plan"),
  });

  const toggleM = useMutation({
    mutationFn: ({ plan, active }: { plan: AdminPlan; active: boolean }) =>
      updateAdminPlan(plan.code, { is_active: active }),
    onSuccess: (plan) => {
      void qc.invalidateQueries({ queryKey: ["admin", "plans"] });
      toast.success(
        plan.is_active
          ? `Plan “${plan.name}” is active again.`
          : `Plan “${plan.name}” deactivated. Existing subscribers keep their terms.`,
      );
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't update the plan"),
  });

  const setField = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function openEdit(plan: AdminPlan) {
    setEditingCode(plan.code);
    setForm(editorFromPlan(plan));
    setFeatureDraft("");
    setEditorOpen(true);
  }

  function openCreate() {
    setEditingCode(null);
    setForm(emptyEditor());
    setFeatureDraft("");
    setEditorOpen(true);
  }

  function addFeature() {
    const value = featureDraft.trim();
    if (!value) return;
    setForm((f) => ({ ...f, features: [...f.features, value] }));
    setFeatureDraft("");
  }

  function removeFeature(index: number) {
    setForm((f) => ({ ...f, features: f.features.filter((_, i) => i !== index) }));
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast.error("Plan name is required.");
      return;
    }
    const num = (v: string) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const patch: PlanPatch = {
      name: form.name.trim(),
      description: form.description.trim(),
      price_monthly: num(form.priceMonthly),
      price_yearly: num(form.priceYearly),
      included_calls: num(form.includedCalls),
      overage_per_1k: form.overagePer1k.trim() === "" ? null : num(form.overagePer1k),
      rate_limit_rpm: num(form.rateLimitRpm),
      max_api_keys: num(form.maxApiKeys),
      max_team_members: num(form.maxTeamMembers),
      features: form.features,
      is_active: form.isActive,
      is_public: form.isPublic,
    };

    if (editingCode) {
      saveM.mutate({ code: editingCode, patch });
      return;
    }
    // Create mode — validate the new code.
    const code = form.code.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_-]{1,30}$/.test(code)) {
      toast.error("Plan code must be a lowercase slug (letters, digits, - or _).");
      return;
    }
    createM.mutate({ code, ...patch });
  }

  const isCreating = editingCode === null;
  const editorBusy = saveM.isPending || createM.isPending;

  const activeCount = plans.filter((p) => p.is_active).length;
  const totalSubscribers = plans.reduce((sum, p) => sum + p.active_subscribers, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tenants"
        title="Plans"
        description="Define the commercial catalog — pricing, quota, limits and features for every subscription tier."
      >
        <Button variant="gradient" className="group" onClick={openCreate} data-testid="plan-new-btn">
          <Icon name="plus" size={16} className="text-white" />
          New plan
        </Button>
      </PageHeader>

      <QueryBoundary
        isLoading={plansQ.isLoading}
        error={plansQ.error}
        onRetry={() => void plansQ.refetch()}
      >
        {/* Summary line */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5" data-testid="plan-summary-count">
            <Icon name="tag" size={15} className="text-primary" />
            <span className="font-semibold tabular-nums text-foreground">{activeCount}</span>{" "}
            active plans
          </span>
          <span
            className="inline-flex items-center gap-1.5"
            data-testid="plan-summary-subscribers"
          >
            <Icon name="users" size={15} className="text-primary" />
            <span className="font-semibold tabular-nums text-foreground">
              {formatNumber(totalSubscribers)}
            </span>{" "}
            active subscribers
          </span>
        </div>

        {plans.length === 0 ? (
          <EmptyState
            icon="tag"
            title="No plans yet"
            description="The plan catalog is provisioned in the backend. Plans appear here as soon as they are seeded."
            testId="plan-empty-state"
          />
        ) : (
          <>
            {/* ── Desktop / tablet table ── */}
            <Card className="hidden overflow-hidden p-0 md:block" data-testid="plan-table-card">
              <div className="overflow-x-auto">
                <Table data-testid="plan-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[220px]">Plan</TableHead>
                      <TableHead className="text-right">Price / mo</TableHead>
                      <TableHead className="text-right">Price / yr</TableHead>
                      <TableHead className="text-right">Included calls</TableHead>
                      <TableHead className="text-right">RPM</TableHead>
                      <TableHead className="text-right">Overage / 1k</TableHead>
                      <TableHead className="text-right">Subscribers</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((row) => (
                      <TableRow
                        key={row.code}
                        data-testid={`plan-row-${row.code}`}
                        className={!row.is_active ? "opacity-60" : undefined}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-display font-semibold">{row.name}</span>
                            <PublicBadge plan={row} />
                          </div>
                          <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {row.code}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {row.description}
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {priceLabel(row.price_monthly)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {priceLabel(row.price_yearly)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {callsLabel(row.included_calls)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatNumber(row.rate_limit_rpm)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {overageLabel(row.overage_per_1k)}
                        </TableCell>
                        <TableCell
                          className="text-right font-mono tabular-nums"
                          data-testid={`plan-subscribers-${row.code}`}
                        >
                          {formatNumber(row.active_subscribers)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={row.is_active ? "active" : "inactive"}
                            testId={`plan-status-${row.code}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="group"
                              onClick={() => openEdit(row)}
                              data-testid={`plan-edit-btn-${row.code}`}
                            >
                              <Icon name="edit" size={15} />
                              Edit
                            </Button>
                            {row.is_active ? (
                              row.active_subscribers > 0 ? (
                                <ConfirmDialog
                                  testId={`plan-archive-dialog-${row.code}`}
                                  destructive
                                  title={`Deactivate “${row.name}”?`}
                                  description={`${formatNumber(
                                    row.active_subscribers,
                                  )} active subscriber${
                                    row.active_subscribers === 1 ? "" : "s"
                                  } stay on their current terms. The plan is hidden from new checkouts until reactivated.`}
                                  confirmLabel="Deactivate plan"
                                  onConfirm={() => toggleM.mutate({ plan: row, active: false })}
                                  trigger={
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="group text-destructive hover:text-destructive"
                                      disabled={toggleM.isPending}
                                      data-testid={`plan-archive-btn-${row.code}`}
                                    >
                                      <Icon name="trash" size={15} />
                                      Deactivate
                                    </Button>
                                  }
                                />
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="group text-destructive hover:text-destructive"
                                  disabled={toggleM.isPending}
                                  onClick={() => toggleM.mutate({ plan: row, active: false })}
                                  data-testid={`plan-archive-btn-${row.code}`}
                                >
                                  <Icon name="trash" size={15} />
                                  Deactivate
                                </Button>
                              )
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="group"
                                disabled={toggleM.isPending}
                                onClick={() => toggleM.mutate({ plan: row, active: true })}
                                data-testid={`plan-restore-btn-${row.code}`}
                              >
                                <Icon name="rocket" size={15} />
                                Activate
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* ── Feature lists per plan (cards) ── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="plan-card-grid">
              {plans.map((row) => (
                <Card
                  key={row.code}
                  data-testid={`plan-card-${row.code}`}
                  className={`group flex flex-col ${!row.is_active ? "opacity-70" : ""}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2 font-display">
                          {row.name}
                          <span className="font-mono text-xs font-normal text-muted-foreground">
                            {row.code}
                          </span>
                        </CardTitle>
                        <CardDescription className="mt-1">{row.description}</CardDescription>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <StatusBadge status={row.is_active ? "active" : "inactive"} />
                        <PublicBadge plan={row} />
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span className="font-display text-2xl font-bold tabular-nums">
                        {priceLabel(row.price_monthly)}
                      </span>
                      {row.price_monthly > 0 && (
                        <span className="text-sm text-muted-foreground">/mo</span>
                      )}
                    </div>
                    {row.price_yearly > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(row.price_yearly, "INR", { maximumFractionDigits: 0 })}{" "}
                        billed yearly
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {callsCompactLabel(row.included_calls)} calls •{" "}
                      {formatNumber(row.rate_limit_rpm)} RPM
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {limitLabel(row.max_api_keys)} API keys • {limitLabel(row.max_team_members)}{" "}
                      team seats
                    </p>
                  </CardHeader>

                  <CardContent className="flex-1">
                    <ul className="space-y-2" data-testid={`plan-features-${row.code}`}>
                      {row.features.map((feature, i) => (
                        <li
                          key={`${row.code}-feat-${i}`}
                          className="flex items-start gap-2 text-sm"
                          data-testid={`plan-feature-${row.code}-${i}`}
                        >
                          <Icon
                            name="checkCircle"
                            size={15}
                            className="mt-0.5 shrink-0 text-success"
                          />
                          <span className="text-foreground/90">{feature}</span>
                        </li>
                      ))}
                      {row.features.length === 0 && (
                        <li className="text-sm text-muted-foreground">No features listed.</li>
                      )}
                    </ul>
                  </CardContent>

                  <CardFooter className="flex items-center justify-between border-t border-border pt-4">
                    <span className="text-xs text-muted-foreground">
                      <span className="font-semibold tabular-nums text-foreground">
                        {formatNumber(row.active_subscribers)}
                      </span>{" "}
                      active subscribers
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="group"
                      onClick={() => openEdit(row)}
                      data-testid={`plan-card-edit-btn-${row.code}`}
                    >
                      <Icon name="edit" size={14} />
                      Edit
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </>
        )}
      </QueryBoundary>

      {/* ── Plan editor dialog ── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent
          className="max-h-[90vh] gap-0 overflow-y-auto sm:max-w-2xl"
          data-testid="plan-editor-dialog"
        >
          <DialogHeader>
            <DialogTitle>{isCreating ? "New plan" : "Edit plan"}</DialogTitle>
            <DialogDescription>
              {isCreating
                ? "Create a new subscription tier. It starts private — flip Public to list it on pricing."
                : "Update pricing, limits and features. Existing subscribers keep their current terms."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Identity */}
            <section className="space-y-3">
              <h4 className="font-display text-sm font-semibold">Identity</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-name">Name</Label>
                  <Input
                    id="plan-name"
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="Growth"
                    data-testid="plan-name-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-code">Code</Label>
                  <Input
                    id="plan-code"
                    value={isCreating ? form.code : (editingCode ?? "")}
                    onChange={(e) => isCreating && setField("code", e.target.value.toLowerCase())}
                    disabled={!isCreating}
                    placeholder="growth"
                    className="font-mono"
                    data-testid="plan-code-input"
                  />
                  {isCreating && (
                    <p className="text-xs text-muted-foreground">
                      Permanent, lowercase slug. Used by checkout & the API.
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-description">Description</Label>
                <Input
                  id="plan-description"
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  placeholder="For scaling D2C & marketplaces."
                  data-testid="plan-description-input"
                />
              </div>
            </section>

            {/* Pricing */}
            <section className="space-y-3">
              <h4 className="font-display text-sm font-semibold">Pricing (INR)</h4>
              <p
                className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning"
                data-testid="plan-price-warning"
              >
                Price changes apply to new checkouts only — existing subscriptions keep their
                current price.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-price-monthly">Monthly price</Label>
                  <Input
                    id="plan-price-monthly"
                    type="number"
                    value={form.priceMonthly}
                    onChange={(e) => setField("priceMonthly", e.target.value)}
                    className="font-mono tabular-nums"
                    data-testid="plan-price-monthly-input"
                  />
                  <p className="text-xs text-muted-foreground">Use -1 for custom / enterprise.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-price-yearly">Yearly price</Label>
                  <Input
                    id="plan-price-yearly"
                    type="number"
                    value={form.priceYearly}
                    onChange={(e) => setField("priceYearly", e.target.value)}
                    className="font-mono tabular-nums"
                    data-testid="plan-price-yearly-input"
                  />
                </div>
              </div>
            </section>

            {/* Quota & limits */}
            <section className="space-y-3">
              <h4 className="font-display text-sm font-semibold">Quota &amp; limits</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-included-calls">Included calls / month</Label>
                  <Input
                    id="plan-included-calls"
                    type="number"
                    value={form.includedCalls}
                    onChange={(e) => setField("includedCalls", e.target.value)}
                    className="font-mono tabular-nums"
                    data-testid="plan-included-calls-input"
                  />
                  <p className="text-xs text-muted-foreground">Use -1 for unlimited.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-overage">Overage / 1k calls (₹)</Label>
                  <Input
                    id="plan-overage"
                    type="number"
                    value={form.overagePer1k}
                    onChange={(e) => setField("overagePer1k", e.target.value)}
                    placeholder="Hard block"
                    className="font-mono tabular-nums"
                    data-testid="plan-overage-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to hard-block calls over quota.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-rpm">Rate limit (RPM)</Label>
                  <Input
                    id="plan-rpm"
                    type="number"
                    value={form.rateLimitRpm}
                    onChange={(e) => setField("rateLimitRpm", e.target.value)}
                    className="font-mono tabular-nums"
                    data-testid="plan-rpm-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="plan-keys"># API keys</Label>
                    <Input
                      id="plan-keys"
                      type="number"
                      value={form.maxApiKeys}
                      onChange={(e) => setField("maxApiKeys", e.target.value)}
                      className="font-mono tabular-nums"
                      data-testid="plan-keys-input"
                    />
                    <p className="text-xs text-muted-foreground">-1 = unlimited.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="plan-team-members"># Team members</Label>
                    <Input
                      id="plan-team-members"
                      type="number"
                      value={form.maxTeamMembers}
                      onChange={(e) => setField("maxTeamMembers", e.target.value)}
                      className="font-mono tabular-nums"
                      data-testid="plan-team-members-input"
                    />
                    <p className="text-xs text-muted-foreground">-1 = unlimited.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Features */}
            <section className="space-y-3">
              <h4 className="font-display text-sm font-semibold">Features</h4>
              <div className="flex gap-2">
                <Input
                  value={featureDraft}
                  onChange={(e) => setFeatureDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addFeature();
                    }
                  }}
                  placeholder="Add a feature, e.g. Priority support"
                  data-testid="plan-feature-input"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="group shrink-0"
                  onClick={addFeature}
                  data-testid="plan-feature-add-btn"
                >
                  <Icon name="plus" size={15} />
                  Add
                </Button>
              </div>
              {form.features.length === 0 ? (
                <p className="text-xs text-muted-foreground">No features added yet.</p>
              ) : (
                <ul className="space-y-2" data-testid="plan-feature-list">
                  {form.features.map((feature, i) => (
                    <li
                      key={`feat-${i}-${feature}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                      data-testid={`plan-feature-item-${i}`}
                    >
                      <span className="flex items-center gap-2">
                        <Icon name="checkCircle" size={15} className="text-success" />
                        {feature}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="group size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeFeature(i)}
                        data-testid={`plan-feature-remove-btn-${i}`}
                        aria-label={`Remove ${feature}`}
                      >
                        <Icon name="trash" size={14} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Visibility */}
            <section className="space-y-3 rounded-xl border border-border bg-brand-gradient-soft/40 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="plan-active" className="text-sm font-medium">
                    Active
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive plans are hidden from new checkouts. Existing subscribers are not
                    affected.
                  </p>
                </div>
                <Switch
                  id="plan-active"
                  checked={form.isActive}
                  onCheckedChange={(v) => setField("isActive", v)}
                  data-testid="plan-active-switch"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="plan-public" className="text-sm font-medium">
                    Public
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Public plans are listed on the public pricing page.
                  </p>
                </div>
                <Switch
                  id="plan-public"
                  checked={form.isPublic}
                  onCheckedChange={(v) => setField("isPublic", v)}
                  data-testid="plan-public-switch"
                />
              </div>
            </section>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditorOpen(false)}
              data-testid="plan-editor-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              variant="gradient"
              onClick={handleSave}
              disabled={editorBusy}
              data-testid="plan-editor-save-btn"
            >
              <Icon name="check" size={16} className="text-white" />
              {editorBusy ? "Saving…" : isCreating ? "Create plan" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
