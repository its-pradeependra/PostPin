"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge, StatusDot } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CopyButton } from "@/components/shared/copy-button";
import { EmptyState } from "@/components/shared/empty-state";
import { ChartCard, AreaTrend } from "@/components/shared/charts";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
  activateTenant,
  getTenantDetail,
  impersonateTenant,
  suspendTenant,
  type TenantDetail,
} from "@/lib/api/services/admin";
import { forgotPassword } from "@/lib/api/services/auth";
import { stepUp } from "@/lib/api/services/account";
import { enterImpersonation } from "@/lib/api/impersonation";
import { ApiError } from "@/lib/api/errors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import {
  formatCurrency,
  formatNumber,
  formatCompact,
  formatDate,
  formatRelativeTime,
} from "@/lib/format";

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

const SEVERITY_TONE: Record<string, React.ComponentProps<typeof StatusDot>["tone"]> = {
  info: "info",
  notice: "success",
  warning: "warning",
  critical: "destructive",
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

function planLabel(plan: string) {
  return PLAN_LABEL[plan] ?? plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function UserDetail({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "tenants", tenantId],
    queryFn: () => getTenantDetail(tenantId),
  });
  const detail = q.data;

  const suspendM = useMutation({
    mutationFn: () => suspendTenant(tenantId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
      toast.success(`${detail?.company.name ?? "Tenant"} suspended`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't suspend the tenant"),
  });

  const activateM = useMutation({
    mutationFn: () => activateTenant(tenantId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
      toast.success(`${detail?.company.name ?? "Tenant"} reactivated`);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn't reactivate the tenant"),
  });

  const resetM = useMutation({
    mutationFn: (email: string) => forgotPassword(email),
    onSuccess: (_res, email) =>
      toast.success("Password reset email sent", { description: email }),
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn't send the password reset email"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tenants / User detail"
        title={detail?.company.name ?? "Tenant"}
        description="Full account view — subscription, usage, API keys, invoices and activity for this tenant."
      />
      <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
        {detail && (
          <DetailBody
            detail={detail}
            onSuspend={() => suspendM.mutate()}
            onActivate={() => activateM.mutate()}
            onResetPassword={(email) => resetM.mutate(email)}
            resetPending={resetM.isPending}
          />
        )}
      </QueryBoundary>
    </div>
  );
}

function DetailBody({
  detail,
  onSuspend,
  onActivate,
  onResetPassword,
  resetPending,
}: {
  detail: TenantDetail;
  onSuspend: () => void;
  onActivate: () => void;
  onResetPassword: (email: string) => void;
  resetPending: boolean;
}) {
  const { company, owner, subscription, usage, keys, invoices, activity } = detail;
  const suspended = company.status === "suspended";
  const [impersonateOpen, setImpersonateOpen] = React.useState(false);

  const usageData = usage.series.map((p) => ({
    label: formatDate(p.date, "short"),
    calls: p.calls,
  }));

  return (
    <div className="space-y-6">
      {/* Header / identity */}
      <Card data-testid="user-detail-header">
        <CardContent className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="size-14">
              <AvatarFallback>{initials(owner?.name ?? company.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-bold tracking-tight">{company.name}</h2>
                {subscription && (
                  <Badge
                    variant={PLAN_BADGE[subscription.plan] ?? "muted"}
                    data-testid="user-detail-plan-badge"
                  >
                    {planLabel(subscription.plan)}
                  </Badge>
                )}
                <StatusBadge status={company.status} testId="user-detail-status-badge" />
              </div>
              <p className="text-sm text-muted-foreground">
                {owner ? owner.name : "No owner on file"} · Joined {formatDate(company.created_at)}
              </p>
              <div className="flex items-center gap-1.5">
                {owner && (
                  <>
                    <code className="font-mono text-xs text-muted-foreground">{owner.email}</code>
                    <CopyButton
                      value={owner.email}
                      testId="user-detail-copy-email-btn"
                      toastMessage="Owner email copied"
                    />
                    <span className="text-muted-foreground/50">·</span>
                  </>
                )}
                <code className="font-mono text-xs text-muted-foreground">{company.id}</code>
              </div>
            </div>
          </div>

          {/* Action cluster */}
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="group"
                  aria-label="More actions"
                  data-testid="user-detail-more-btn"
                >
                  <Icon name="more" size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Manage tenant</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={suspended || !owner}
                  onSelect={(e) => {
                    e.preventDefault();
                    setImpersonateOpen(true);
                  }}
                  data-testid="user-detail-impersonate-item"
                >
                  <Icon name="users" size={16} /> Impersonate tenant
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!owner || resetPending}
                  onSelect={() => owner && onResetPassword(owner.email)}
                  data-testid="user-detail-reset-password-item"
                >
                  <Icon name="lock" size={16} /> Send password reset
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {suspended ? (
                  <ConfirmDialog
                    trigger={
                      <DropdownMenuItem
                        onSelect={(e) => e.preventDefault()}
                        data-testid="user-detail-activate-item"
                      >
                        <Icon name="checkCircle" size={16} /> Reactivate tenant
                      </DropdownMenuItem>
                    }
                    title={`Reactivate ${company.name}?`}
                    description="API keys resume returning rates immediately and billing restarts on the next cycle."
                    confirmLabel="Reactivate"
                    onConfirm={onActivate}
                    testId="user-detail-activate-dialog"
                  />
                ) : (
                  <ConfirmDialog
                    trigger={
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={(e) => e.preventDefault()}
                        data-testid="user-detail-suspend-item"
                      >
                        <Icon name="lock" size={16} /> Suspend tenant
                      </DropdownMenuItem>
                    }
                    title={`Suspend ${company.name}?`}
                    description={`${keys.length} API key${keys.length === 1 ? "" : "s"} will immediately stop returning rates and billing pauses. The owner is notified. This is reversible.`}
                    confirmLabel="Suspend tenant"
                    destructive
                    onConfirm={onSuspend}
                    testId="user-detail-suspend-dialog"
                  />
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      <ImpersonateDialog
        open={impersonateOpen}
        onOpenChange={setImpersonateOpen}
        companyId={company.id}
        tenantName={company.name}
      />

      {suspended && (
        <div
          className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-testid="user-detail-suspended-banner"
        >
          <Icon name="lock" size={16} />
          This tenant is suspended. Their API keys are returning 403 and billing is paused.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Subscription */}
        <Card className="lg:col-span-1" data-testid="user-subscription-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="billing" size={18} className="text-primary" /> Subscription
            </CardTitle>
            <CardDescription>Plan, revenue and quota usage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription ? (
              <>
                <dl className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Plan</dt>
                    <dd>
                      <Badge variant={PLAN_BADGE[subscription.plan] ?? "muted"}>
                        {planLabel(subscription.plan)}
                      </Badge>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">MRR</dt>
                    <dd className="font-mono font-semibold tabular-nums">
                      {subscription.mrr > 0 ? formatCurrency(subscription.mrr) : "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Interval</dt>
                    <dd className="capitalize">{subscription.interval}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Joined</dt>
                    <dd className="tabular-nums">{formatDate(company.created_at)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Renews</dt>
                    <dd className="tabular-nums">{formatDate(subscription.current_period_end)}</dd>
                  </div>
                </dl>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Quota usage</span>
                    <span className="font-mono text-xs tabular-nums">
                      {formatCompact(subscription.calls_used)} /{" "}
                      {subscription.included_calls > 0 ? formatCompact(subscription.included_calls) : "∞"}
                    </span>
                  </div>
                  {subscription.included_calls > 0 ? (
                    <>
                      <Progress
                        value={Math.min(100, subscription.quota_pct)}
                        indicatorClassName={subscription.quota_pct >= 90 ? "bg-warning" : undefined}
                        data-testid="user-quota-progress"
                      />
                      <p className="text-xs text-muted-foreground">
                        {Math.round(subscription.quota_pct)}% of the monthly call quota used.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Unlimited plan — no monthly call quota.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No active subscription. This tenant joined on {formatDate(company.created_at)}.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Usage */}
        <ChartCard
          title="API usage"
          description={`${formatNumber(usage.calls_30d)} calls in the last 30 days.`}
          className="lg:col-span-2"
          testId="user-usage-panel"
        >
          {usageData.length === 0 ? (
            <EmptyState
              icon="activity"
              title="No usage yet"
              description="This tenant hasn't made any API calls in the last 30 days."
              testId="user-usage-empty"
            />
          ) : (
            <AreaTrend
              data={usageData}
              dataKey="calls"
              xKey="label"
              height={220}
              color="var(--chart-1)"
              valueFormatter={(v) => formatCompact(v)}
            />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* API keys */}
        <Card data-testid="user-keys-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="keys" size={18} className="text-primary" /> API keys
            </CardTitle>
            <CardDescription>
              {keys.length} key{keys.length === 1 ? "" : "s"} issued by this tenant.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {keys.length === 0 ? (
              <EmptyState
                icon="keys"
                title="No API keys"
                description="This tenant hasn't created an API key yet."
                testId="user-keys-empty"
              />
            ) : (
              keys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                  data-testid={`user-key-row-${k.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{k.name}</p>
                    <code className="font-mono text-xs text-muted-foreground">{k.masked}</code>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {k.last_used_at
                        ? `Last used ${formatRelativeTime(k.last_used_at)}`
                        : "Never used"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={k.mode === "live" ? "gradient" : "warning"}>
                      {k.mode === "live" ? "Live" : "Test"}
                    </Badge>
                    <StatusBadge status={k.status} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Activity */}
        <Card data-testid="user-activity-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="activity" size={18} className="text-primary" /> Recent activity
            </CardTitle>
            <CardDescription>Account events and admin actions.</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <EmptyState
                icon="activity"
                title="No activity yet"
                description="Account events and admin actions will show up here."
                testId="user-activity-empty"
              />
            ) : (
              <ol className="space-y-4">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-3" data-testid={`user-activity-${a.id}`}>
                    <div className="flex flex-col items-center">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-gradient-soft text-primary">
                        <Icon name="activity" size={15} />
                      </span>
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{a.action}</p>
                        <StatusDot tone={SEVERITY_TONE[a.severity] ?? "muted"} />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {formatRelativeTime(a.at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invoices */}
      <Card data-testid="user-invoices-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon name="invoice" size={18} className="text-primary" /> Invoices
          </CardTitle>
          <CardDescription>Billing statements issued to this tenant.</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <EmptyState
              icon="invoice"
              title="No invoices"
              description="Invoices appear here once this tenant is billed for a paid plan."
              testId="user-invoices-empty"
            />
          ) : (
            <div className="-mx-2 overflow-x-auto sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="hidden sm:table-cell">Issued</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id} data-testid={`user-invoice-row-${inv.id}`}>
                      <TableCell className="font-mono text-sm font-medium">{inv.number}</TableCell>
                      <TableCell className="text-sm">{planLabel(inv.plan)}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell tabular-nums">
                        {formatDate(inv.issued_at)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(inv.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusBadge status={inv.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <Button variant="ghost" asChild className="group" data-testid="user-detail-back-btn">
          <Link href="/admin/users">
            <Icon name="arrowRight" size={16} className="rotate-180" />
            All tenants
          </Link>
        </Button>
        <span className="ml-3 text-xs text-muted-foreground tabular-nums">
          Calls (30d) {formatNumber(usage.calls_30d)}
        </span>
      </div>
    </div>
  );
}

/* ── Impersonation step-up dialog ─────────────────────────────────── */
function ImpersonateDialog({
  open,
  onOpenChange,
  companyId,
  tenantName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  tenantName: string;
}) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");

  const goM = useMutation({
    mutationFn: async () => {
      const step = await stepUp(password, code || undefined);
      return impersonateTenant(companyId, step.step_up_token);
    },
    onSuccess: (res) => {
      enterImpersonation(res.access_token, { tenantName: res.tenant.name, tenantId: res.tenant.id });
      toast.success(`Now viewing as ${res.tenant.name}`);
      onOpenChange(false);
      router.push("/app");
    },
    onError: (e) => {
      if (e instanceof ApiError && (e.code === "invalid_password" || e.code === "invalid_totp")) {
        toast.error(e.message);
      } else {
        toast.error(e instanceof ApiError ? e.message : "Couldn't start impersonation");
      }
    },
  });

  React.useEffect(() => {
    if (!open) {
      setPassword("");
      setCode("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="impersonate-dialog">
        <DialogHeader>
          <DialogTitle>Impersonate {tenantName}</DialogTitle>
          <DialogDescription>
            Confirm your password to view this tenant&apos;s portal as their owner. This is
            audited. You can exit anytime from the banner.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="impersonate-password">Your password</Label>
            <Input
              id="impersonate-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              data-testid="impersonate-password-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="impersonate-code">2FA code (if enabled)</Label>
            <Input
              id="impersonate-code"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="font-mono"
              data-testid="impersonate-code-input"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="impersonate-cancel-btn">
            Cancel
          </Button>
          <Button
            variant="gradient"
            disabled={goM.isPending || password.length < 1}
            onClick={() => goM.mutate()}
            data-testid="impersonate-confirm-btn"
          >
            <Icon name="users" size={16} className="text-white" />
            {goM.isPending ? "Verifying…" : "Impersonate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

