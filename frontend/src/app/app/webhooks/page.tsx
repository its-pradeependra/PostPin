"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CopyButton } from "@/components/shared/copy-button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

import {
  createWebhook,
  deleteWebhook,
  listDeliveries,
  listWebhooks,
  replayDelivery,
  testWebhook,
  updateWebhook,
  type WebhookEvent,
} from "@/lib/api/services/webhooks";
import { ApiError } from "@/lib/api/errors";
import { formatPercent, formatRelativeTime, formatLatency } from "@/lib/format";

/* ──────────────────────────────────────────────────────────────────
   Event catalogue — every subscribable WebhookEvent + human label
   ────────────────────────────────────────────────────────────────── */
const WEBHOOK_EVENTS: { value: WebhookEvent; label: string; hint: string }[] = [
  { value: "rate.calculated", label: "rate.calculated", hint: "A shipping rate was computed" },
  { value: "key.created", label: "key.created", hint: "A new API key was issued" },
  { value: "key.revoked", label: "key.revoked", hint: "An API key was revoked" },
  { value: "subscription.updated", label: "subscription.updated", hint: "Plan or quota changed" },
  { value: "invoice.paid", label: "invoice.paid", hint: "An invoice was paid" },
  { value: "sync.completed", label: "sync.completed", hint: "Pincode sync finished" },
  { value: "sync.failed", label: "sync.failed", hint: "Pincode sync failed" },
];

/** Fallback while the list loads — the real cap comes from the API response. */
const PLAN_CAP = 10;

/* ──────────────────────────────────────────────────────────────────
   Create-endpoint dialog
   ────────────────────────────────────────────────────────────────── */
function CreateWebhookDialog({
  open,
  onOpenChange,
  onCreate,
  pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (url: string, events: WebhookEvent[]) => void;
  pending: boolean;
}) {
  const [url, setUrl] = React.useState("");
  const [selected, setSelected] = React.useState<WebhookEvent[]>(["rate.calculated"]);
  const [touched, setTouched] = React.useState(false);

  const urlValid = /^https:\/\/.+/.test(url.trim());
  const eventsValid = selected.length > 0;
  const canSubmit = urlValid && eventsValid;

  function reset() {
    setUrl("");
    setSelected(["rate.calculated"]);
    setTouched(false);
  }

  function toggle(ev: WebhookEvent, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, ev] : prev.filter((e) => e !== ev)));
  }

  function submit() {
    setTouched(true);
    if (!canSubmit) return;
    onCreate(url.trim(), selected);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg" data-testid="webhook-create-dialog">
        <DialogHeader>
          <DialogTitle>Add an endpoint</DialogTitle>
          <DialogDescription>
            Postpin will POST a signed JSON payload to this URL for the events you select. Endpoints must use HTTPS.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Endpoint URL</Label>
            <Input
              id="webhook-url"
              type="url"
              inputMode="url"
              placeholder="https://hooks.yourapp.in/postpin"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="font-mono text-sm"
              data-testid="webhook-url-input"
              aria-invalid={touched && !urlValid}
            />
            {touched && !urlValid && (
              <p className="text-xs text-destructive" data-testid="webhook-url-error">
                Enter a valid HTTPS URL.
              </p>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label>Events to subscribe</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{selected.length} selected</span>
            </div>
            <div
              className="grid max-h-64 gap-1.5 overflow-y-auto rounded-xl border border-border bg-card/40 p-1.5"
              data-testid="webhook-events-list"
            >
              {WEBHOOK_EVENTS.map((ev) => {
                const checked = selected.includes(ev.value);
                return (
                  <label
                    key={ev.value}
                    htmlFor={`webhook-event-${ev.value}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent"
                  >
                    <Checkbox
                      id={`webhook-event-${ev.value}`}
                      checked={checked}
                      onCheckedChange={(c) => toggle(ev.value, c === true)}
                      className="mt-0.5"
                      data-testid={`webhook-event-checkbox-${ev.value}`}
                    />
                    <span className="space-y-0.5">
                      <span className="block font-mono text-sm font-medium">{ev.label}</span>
                      <span className="block text-xs text-muted-foreground">{ev.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {touched && !eventsValid && (
              <p className="text-xs text-destructive" data-testid="webhook-events-error">
                Select at least one event.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
            data-testid="webhook-create-cancel-btn"
          >
            Cancel
          </Button>
          <Button variant="gradient" onClick={submit} disabled={!canSubmit || pending} data-testid="webhook-create-submit-btn">
            {pending ? "Creating…" : "Create endpoint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────
   One-time signing-secret reveal (shown once, right after creation)
   ────────────────────────────────────────────────────────────────── */
function SecretRevealDialog({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  return (
    <Dialog open={secret !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg" data-testid="webhook-secret-dialog">
        <DialogHeader>
          <DialogTitle>Copy your signing secret</DialogTitle>
          <DialogDescription>
            Use this secret to verify the <code className="font-mono">X-Postpin-Signature</code> header. It is shown{" "}
            <strong>only once</strong> — store it somewhere safe.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-popover px-3 py-2.5">
          <code className="flex-1 truncate font-mono text-sm" data-testid="webhook-secret-value">
            {secret}
          </code>
          <CopyButton value={secret ?? ""} label="Copy" testId="webhook-secret-copy" toastMessage="Signing secret copied" />
        </div>
        <DialogFooter>
          <Button variant="gradient" onClick={onClose} data-testid="webhook-secret-done">
            I&apos;ve saved it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Status-code badge for deliveries
   ────────────────────────────────────────────────────────────────── */
function StatusCodeBadge({ status, ok }: { status: number; ok: boolean }) {
  return (
    <Badge variant={ok ? "success" : "destructive"} className="font-mono tabular-nums">
      {status === 0 ? "ERR" : status}
    </Badge>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────────── */
export default function WebhooksPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newSecret, setNewSecret] = React.useState<string | null>(null);

  const hooksQ = useQuery({ queryKey: ["webhooks"], queryFn: listWebhooks });
  const deliveriesQ = useQuery({ queryKey: ["webhooks", "deliveries"], queryFn: () => listDeliveries(20) });

  const hooks = hooksQ.data?.webhooks ?? [];
  // Endpoint cap comes from the server — the single source of truth it enforces.
  const cap = hooksQ.data?.cap ?? PLAN_CAP;
  const deliveries = deliveriesQ.data ?? [];

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ["webhooks"] });
  };

  const createM = useMutation({
    mutationFn: (input: { url: string; events: WebhookEvent[] }) => createWebhook(input),
    onSuccess: (res) => {
      setCreateOpen(false);
      setNewSecret(res.secret);
      invalidateAll();
      toast.success("Endpoint created", { description: res.webhook.url });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't create endpoint"),
  });

  const statusM = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "paused" }) => updateWebhook(id, { status }),
    onSuccess: (w) => {
      invalidateAll();
      toast.success(w.status === "active" ? "Endpoint resumed" : "Endpoint paused", { description: w.url });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't update endpoint"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteWebhook(id),
    onSuccess: () => {
      invalidateAll();
      toast.success("Endpoint deleted");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't delete endpoint"),
  });

  const testM = useMutation({
    mutationFn: (id: string) => testWebhook(id),
    onSuccess: (res) => {
      invalidateAll();
      if (res.delivery.ok) {
        toast.success("Test delivered", {
          description: `Responded ${res.delivery.status} in ${formatLatency(res.delivery.duration_ms)}`,
        });
      } else {
        toast.error("Test failed", {
          description: res.delivery.status ? `Endpoint responded ${res.delivery.status}` : "Endpoint could not be reached",
        });
      }
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't send test event"),
  });

  const replayM = useMutation({
    mutationFn: (deliveryId: string) => replayDelivery(deliveryId),
    onSuccess: (res) => {
      invalidateAll();
      toast[res.delivery.ok ? "success" : "error"](res.delivery.ok ? "Delivery replayed" : "Replay failed", {
        description: res.delivery.status ? `Responded ${res.delivery.status}` : "Endpoint could not be reached",
      });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't replay delivery"),
  });

  const hookUrlById = React.useMemo(() => Object.fromEntries(hooks.map((h) => [h.id, h.url])), [hooks]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Develop"
        title="Webhooks"
        description="Register HTTPS endpoints to receive signed event notifications from Postpin in real time."
      >
        <Badge variant="muted" className="tabular-nums" data-testid="webhook-cap-chip">
          {hooks.length} / {cap} endpoints
        </Badge>
        <Button
          variant="gradient"
          onClick={() => setCreateOpen(true)}
          className="group"
          disabled={hooks.length >= cap}
          data-testid="webhook-add-btn"
        >
          <Icon name="plus" size={16} className="text-white" />
          Add endpoint
        </Button>
      </PageHeader>

      <CreateWebhookDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={(url, events) => createM.mutate({ url, events })}
        pending={createM.isPending}
      />
      <SecretRevealDialog secret={newSecret} onClose={() => setNewSecret(null)} />

      {/* Endpoints */}
      <QueryBoundary isLoading={hooksQ.isLoading} error={hooksQ.error} onRetry={() => void hooksQ.refetch()}>
        {hooks.length === 0 ? (
          <EmptyState
            icon="webhook"
            title="No endpoints yet"
            description="Add your first endpoint to start receiving events like rate.calculated, invoice.paid and sync.completed."
            testId="webhook-empty-state"
          >
            <Button variant="gradient" onClick={() => setCreateOpen(true)} className="group" data-testid="webhook-empty-add-btn">
              <Icon name="plus" size={16} className="text-white" />
              Add endpoint
            </Button>
          </EmptyState>
        ) : (
          <Card data-testid="webhook-endpoints-card">
            <CardHeader>
              <CardTitle>Endpoints</CardTitle>
              <CardDescription>Your registered URLs and the events they subscribe to.</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Desktop / tablet table */}
              <div className="hidden overflow-x-auto md:block">
                <Table data-testid="webhook-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Events</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Success</TableHead>
                      <TableHead>Last delivery</TableHead>
                      <TableHead>Signing secret</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hooks.map((h) => (
                      <TableRow key={h.id} data-testid={`webhook-row-${h.id}`}>
                        <TableCell className="max-w-[260px]">
                          <span className="block truncate font-mono text-xs" title={h.url}>
                            {h.url}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {h.events.map((ev) => (
                              <Badge key={ev} variant="secondary" className="font-mono text-[11px]">
                                {ev}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={h.status} testId={`webhook-status-${h.id}`} />
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{formatPercent(h.success_rate)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {h.last_delivery_at ? formatRelativeTime(h.last_delivery_at) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{h.secret_masked}</code>
                            <CopyButton value={h.secret_masked} testId={`webhook-secret-copy-${h.id}`} toastMessage="Masked secret copied" />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="group"
                              onClick={() => testM.mutate(h.id)}
                              disabled={testM.isPending}
                              data-testid={`webhook-test-${h.id}`}
                            >
                              <Icon name="sync" size={14} />
                              Send test
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label="Row actions" data-testid={`webhook-actions-${h.id}`}>
                                  <Icon name="more" size={16} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Manage</DropdownMenuLabel>
                                <DropdownMenuItem
                                  onSelect={() => statusM.mutate({ id: h.id, status: h.status === "active" ? "paused" : "active" })}
                                  data-testid={`webhook-toggle-${h.id}`}
                                >
                                  <Icon name={h.status === "active" ? "eyeOff" : "checkCircle"} size={15} />
                                  {h.status === "active" ? "Pause" : "Resume"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <ConfirmDialog
                                  trigger={
                                    <DropdownMenuItem
                                      onSelect={(e) => e.preventDefault()}
                                      className="text-destructive focus:text-destructive"
                                      data-testid={`webhook-delete-trigger-${h.id}`}
                                    >
                                      <Icon name="trash" size={15} />
                                      Delete
                                    </DropdownMenuItem>
                                  }
                                  title="Delete this endpoint?"
                                  description={`${h.url} will stop receiving events immediately. This cannot be undone.`}
                                  confirmLabel="Delete endpoint"
                                  destructive
                                  onConfirm={() => deleteM.mutate(h.id)}
                                  testId={`webhook-delete-dialog-${h.id}`}
                                />
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile stacked cards */}
              <div className="space-y-3 md:hidden">
                {hooks.map((h) => (
                  <div key={h.id} className="rounded-xl border border-border bg-card/40 p-4" data-testid={`webhook-card-${h.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="break-all font-mono text-xs" title={h.url}>
                        {h.url}
                      </span>
                      <StatusBadge status={h.status} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {h.events.map((ev) => (
                        <Badge key={ev} variant="secondary" className="font-mono text-[11px]">
                          {ev}
                        </Badge>
                      ))}
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Success</dt>
                        <dd className="font-mono tabular-nums">{formatPercent(h.success_rate)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Last delivery</dt>
                        <dd>{h.last_delivery_at ? formatRelativeTime(h.last_delivery_at) : "—"}</dd>
                      </div>
                    </dl>
                    <div className="mt-3">
                      <span className="mb-1 block text-xs text-muted-foreground">Signing secret</span>
                      <div className="flex items-center gap-1.5">
                        <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{h.secret_masked}</code>
                        <CopyButton value={h.secret_masked} testId={`webhook-card-secret-copy-${h.id}`} toastMessage="Masked secret copied" />
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="group flex-1"
                        onClick={() => testM.mutate(h.id)}
                        disabled={testM.isPending}
                        data-testid={`webhook-card-test-${h.id}`}
                      >
                        <Icon name="sync" size={14} />
                        Send test
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => statusM.mutate({ id: h.id, status: h.status === "active" ? "paused" : "active" })}
                        data-testid={`webhook-card-toggle-${h.id}`}
                      >
                        {h.status === "active" ? "Pause" : "Resume"}
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" data-testid={`webhook-card-delete-${h.id}`}>
                            <Icon name="trash" size={14} />
                            Delete
                          </Button>
                        }
                        title="Delete this endpoint?"
                        description={`${h.url} will stop receiving events immediately. This cannot be undone.`}
                        confirmLabel="Delete endpoint"
                        destructive
                        onConfirm={() => deleteM.mutate(h.id)}
                        testId={`webhook-card-delete-dialog-${h.id}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </QueryBoundary>

      {/* Recent deliveries */}
      <Card data-testid="webhook-deliveries-card">
        <CardHeader>
          <CardTitle>Recent deliveries</CardTitle>
          <CardDescription>The latest delivery attempts across all of your endpoints.</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryBoundary isLoading={deliveriesQ.isLoading} error={deliveriesQ.error} onRetry={() => void deliveriesQ.refetch()}>
            {deliveries.length === 0 ? (
              <EmptyState
                icon="activity"
                title="No deliveries yet"
                description="Deliveries appear here once your endpoints start receiving events. Use “Send test” to fire one now."
                testId="webhook-deliveries-empty"
              />
            ) : (
              <>
                {/* Desktop / tablet table */}
                <div className="hidden overflow-x-auto md:block">
                  <Table data-testid="webhook-deliveries-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Endpoint</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Attempt</TableHead>
                        <TableHead className="text-right">Duration</TableHead>
                        <TableHead>When</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliveries.map((d) => (
                        <TableRow key={d.id} data-testid={`webhook-delivery-row-${d.id}`}>
                          <TableCell className="font-mono text-xs">{d.event}</TableCell>
                          <TableCell className="max-w-[220px]">
                            <span className="block truncate font-mono text-xs text-muted-foreground" title={hookUrlById[d.webhook_id] ?? d.webhook_id}>
                              {hookUrlById[d.webhook_id] ?? d.webhook_id}
                            </span>
                          </TableCell>
                          <TableCell>
                            <StatusCodeBadge status={d.status} ok={d.ok} />
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{d.attempt}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{formatLatency(d.duration_ms)}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatRelativeTime(d.at)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="group"
                              onClick={() => replayM.mutate(d.id)}
                              disabled={replayM.isPending}
                              data-testid={`webhook-delivery-replay-${d.id}`}
                            >
                              <Icon name="sync" size={14} />
                              Replay
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile stacked cards */}
                <div className="space-y-3 md:hidden">
                  {deliveries.map((d) => (
                    <div key={d.id} className="rounded-xl border border-border bg-card/40 p-4" data-testid={`webhook-delivery-card-${d.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{d.event}</span>
                        <StatusCodeBadge status={d.status} ok={d.ok} />
                      </div>
                      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground" title={hookUrlById[d.webhook_id] ?? d.webhook_id}>
                        {hookUrlById[d.webhook_id] ?? d.webhook_id}
                      </p>
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <dt className="text-muted-foreground">Attempt</dt>
                          <dd className="font-mono tabular-nums">{d.attempt}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Duration</dt>
                          <dd className="font-mono tabular-nums">{formatLatency(d.duration_ms)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">When</dt>
                          <dd>{formatRelativeTime(d.at)}</dd>
                        </div>
                      </dl>
                      <Button
                        variant="outline"
                        size="sm"
                        className="group mt-3 w-full"
                        onClick={() => replayM.mutate(d.id)}
                        disabled={replayM.isPending}
                        data-testid={`webhook-delivery-card-replay-${d.id}`}
                      >
                        <Icon name="sync" size={14} />
                        Replay
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
}
