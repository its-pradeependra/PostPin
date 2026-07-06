"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
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
  adminAssignRateCard,
  adminCompanyOptions,
  adminCreateRateCard,
  adminGetRateCard,
  adminSimulateRateCard,
  adminUpdateRateCard,
  getAdminRateCards,
  RATE_CARD_ZONES,
  type AdminRateCard,
  type RateCardRow,
  type RateSimResult,
} from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";
import { formatCurrency, formatDate } from "@/lib/format";

type OverviewCard = Awaited<ReturnType<typeof getAdminRateCards>>["custom"][number];

const SERVICE_LEVELS = ["surface", "express", "same_day", "air"] as const;

function emptyRows(): RateCardRow[] {
  return RATE_CARD_ZONES.map((z) => ({ zone_code: z.code, base_charge: 0, per_500g: 0 }));
}

export default function AdminRateCardsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "rate-cards"], queryFn: getAdminRateCards });
  const standard = q.data?.standard ?? [];
  const custom = q.data?.custom ?? [];

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [simCard, setSimCard] = React.useState<OverviewCard | null>(null);

  function openCreate() {
    setEditingId(null);
    setEditorOpen(true);
  }
  function openEdit(id: string) {
    setEditingId(id);
    setEditorOpen(true);
  }

  const assignM = useMutation({
    mutationFn: adminAssignRateCard,
    onSuccess: (card) => {
      void qc.invalidateQueries({ queryKey: ["admin", "rate-cards"] });
      toast.success(`“${card.name}” is now the active default for ${card.company_name ?? "the tenant"}.`);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't assign the card"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Rate cards"
        description="The zone-rate matrix the live engine prices on, plus every tenant custom card. Create, edit, assign and simulate cards across the platform."
      >
        <Button variant="gradient" className="group" onClick={openCreate} data-testid="ratecard-new-btn">
          <Icon name="plus" trigger="group-hover" size={16} className="text-white" />
          New rate card
        </Button>
      </PageHeader>

      <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
        {/* ── Standard engine matrix ── */}
        <Card data-testid="ratecard-standard-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <Icon name="rateCard" size={18} className="text-primary" />
              Standard rate card
            </CardTitle>
            <CardDescription>
              The live engine matrix — tenants without an assigned custom card price on these zone
              rates. Edit the numbers on the Zones page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {standard.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                The engine hasn&apos;t published standard zone rates yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table data-testid="ratecard-standard-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Zone</TableHead>
                      <TableHead className="text-right">Base charge</TableHead>
                      <TableHead className="text-right">Per kg</TableHead>
                      <TableHead>SLA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {standard.map((row) => (
                      <TableRow key={row.zone} data-testid={`ratecard-standard-row-${row.zone}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon name="zones" size={15} className="text-primary" />
                            <span className="font-medium">{row.name}</span>
                            <span className="font-mono text-xs text-muted-foreground">{row.zone}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatCurrency(row.base_charge)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatCurrency(row.per_kg)}/kg
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums">
                          {row.sla_min}–{row.sla_max} days
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Custom cards ── */}
        <section className="space-y-3" data-testid="ratecard-custom-section">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-lg font-semibold">Custom rate cards</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {custom.length} card{custom.length === 1 ? "" : "s"}
            </span>
          </div>

          {custom.length === 0 ? (
            <EmptyState
              icon="rateCard"
              title="No custom rate cards yet"
              description="Create one for a tenant with New rate card, or tenants can build their own from the portal."
              testId="ratecard-empty-state"
            />
          ) : (
            <Card className="overflow-hidden p-0" data-testid="ratecard-list-card">
              <div className="overflow-x-auto">
                <Table data-testid="ratecard-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Rate card</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead className="text-right">Slabs</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {custom.map((card) => (
                      <TableRow key={card.id} data-testid={`ratecard-row-${card.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-gradient-soft text-primary">
                              <Icon name="rateCard" size={16} />
                            </span>
                            <div>
                              <span className="font-display font-semibold">{card.name}</span>
                              <p
                                className="font-mono text-xs text-muted-foreground"
                                data-testid={`ratecard-code-${card.id}`}
                              >
                                {card.code}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={card.status} testId={`ratecard-status-${card.id}`} />
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/admin/users/${card.company_id}`}
                            className="text-sm font-medium text-foreground hover:text-primary"
                            data-testid={`ratecard-tenant-link-${card.id}`}
                          >
                            {card.company_name}
                          </Link>
                        </TableCell>
                        <TableCell
                          className="text-right font-mono text-sm tabular-nums"
                          data-testid={`ratecard-slabs-${card.id}`}
                        >
                          {card.slabs}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="group"
                              onClick={() => setSimCard(card)}
                              data-testid={`ratecard-simulate-btn-${card.id}`}
                            >
                              <Icon name="calculator" trigger="group-hover" size={14} />
                              Simulate
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="group"
                              onClick={() => openEdit(card.id)}
                              data-testid={`ratecard-edit-btn-${card.id}`}
                            >
                              <Icon name="edit" trigger="group-hover" size={14} />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="group"
                              onClick={() => assignM.mutate(card.id)}
                              disabled={assignM.isPending}
                              data-testid={`ratecard-assign-btn-${card.id}`}
                            >
                              <Icon name="check" trigger="group-hover" size={14} />
                              Assign
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </section>
      </QueryBoundary>

      {editorOpen && (
        <RateCardEditor
          id={editingId}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["admin", "rate-cards"] });
            setEditorOpen(false);
          }}
        />
      )}

      {simCard && <SimulateDialog card={simCard} onClose={() => setSimCard(null)} />}
    </div>
  );
}

/* ── Create / edit dialog ─────────────────────────────────────────── */
function RateCardEditor({
  id,
  onClose,
  onSaved,
}: {
  id: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isCreating = id === null;
  const [companyId, setCompanyId] = React.useState("");
  const [companyQuery, setCompanyQuery] = React.useState("");
  const [name, setName] = React.useState("");
  const [service, setService] = React.useState("surface");
  const [status, setStatus] = React.useState("draft");
  const [rows, setRows] = React.useState<RateCardRow[]>(emptyRows());

  const companiesQ = useQuery({
    queryKey: ["admin", "company-options", companyQuery],
    queryFn: () => adminCompanyOptions(companyQuery),
    enabled: isCreating,
  });

  const cardQ = useQuery({
    queryKey: ["admin", "rate-card", id],
    queryFn: () => adminGetRateCard(id!),
    enabled: !isCreating,
  });

  React.useEffect(() => {
    if (cardQ.data) {
      setName(cardQ.data.name);
      setService(cardQ.data.service_level);
      setStatus(cardQ.data.status);
      setRows(
        RATE_CARD_ZONES.map((z) => {
          const r = cardQ.data.rows.find((row) => row.zone_code === z.code);
          return { zone_code: z.code, base_charge: r?.base_charge ?? 0, per_500g: r?.per_500g ?? 0 };
        }),
      );
    }
  }, [cardQ.data]);

  const saveM = useMutation({
    mutationFn: () => {
      const rowsPayload = rows.filter((r) => r.base_charge > 0 || r.per_500g > 0);
      if (isCreating) {
        return adminCreateRateCard({ company_id: companyId, name, service_level: service, status, rows: rowsPayload });
      }
      return adminUpdateRateCard(id!, { name, service_level: service, status, rows: rowsPayload });
    },
    onSuccess: (card: AdminRateCard) => {
      toast.success(isCreating ? `Rate card “${card.name}” created.` : `Rate card “${card.name}” updated.`);
      onSaved();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save the rate card"),
  });

  function setRow(zoneCode: string, field: "base_charge" | "per_500g", value: string) {
    const n = Number(value);
    setRows((rs) => rs.map((r) => (r.zone_code === zoneCode ? { ...r, [field]: Number.isFinite(n) ? n : 0 } : r)));
  }

  function handleSave() {
    if (isCreating && !companyId) {
      toast.error("Pick a tenant for this card.");
      return;
    }
    if (!name.trim()) {
      toast.error("Card name is required.");
      return;
    }
    saveM.mutate();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="ratecard-editor-dialog">
        <DialogHeader>
          <DialogTitle>{isCreating ? "New rate card" : "Edit rate card"}</DialogTitle>
          <DialogDescription>
            Per-zone freight: base covers the first 500 g, then each additional 500 g adds the step
            charge. Assign the card to bill a tenant on it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid gap-4 sm:grid-cols-2">
            {isCreating ? (
              <div className="space-y-1.5">
                <Label htmlFor="rc-company">Tenant</Label>
                <Input
                  placeholder="Search tenants…"
                  value={companyQuery}
                  onChange={(e) => setCompanyQuery(e.target.value)}
                  className="mb-2"
                  data-testid="ratecard-company-search"
                />
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger id="rc-company" data-testid="ratecard-company-select">
                    <SelectValue placeholder="Select a tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {(companiesQ.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Tenant</Label>
                <Input value={cardQ.data?.company_name ?? "…"} disabled data-testid="ratecard-company-readonly" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="rc-name">Card name</Label>
              <Input
                id="rc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Peak season card"
                data-testid="ratecard-name-input"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Service level</Label>
              <Select value={service} onValueChange={setService}>
                <SelectTrigger data-testid="ratecard-service-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_LEVELS.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger data-testid="ratecard-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Per-zone pricing */}
          <div className="space-y-2">
            <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Zone pricing (₹)
            </p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zone</TableHead>
                    <TableHead className="text-right">Base (first 500 g)</TableHead>
                    <TableHead className="text-right">Per +500 g</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {RATE_CARD_ZONES.map((z) => {
                    const row = rows.find((r) => r.zone_code === z.code)!;
                    return (
                      <TableRow key={z.code}>
                        <TableCell className="font-medium">
                          {z.label}{" "}
                          <span className="font-mono text-xs text-muted-foreground">{z.code}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={String(row.base_charge)}
                            onChange={(e) => setRow(z.code, "base_charge", e.target.value)}
                            className="ml-auto w-28 text-right font-mono tabular-nums"
                            data-testid={`ratecard-base-${z.code}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={String(row.per_500g)}
                            onChange={(e) => setRow(z.code, "per_500g", e.target.value)}
                            className="ml-auto w-28 text-right font-mono tabular-nums"
                            data-testid={`ratecard-per500-${z.code}`}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave a zone at 0/0 to skip it — the engine falls back to standard pricing for skipped
              zones.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="ratecard-editor-cancel-btn">
            Cancel
          </Button>
          <Button
            variant="gradient"
            onClick={handleSave}
            disabled={saveM.isPending}
            data-testid="ratecard-editor-save-btn"
          >
            <Icon name="check" trigger="group-hover" size={16} className="text-white" />
            {saveM.isPending ? "Saving…" : isCreating ? "Create card" : "Save card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Simulate dialog ──────────────────────────────────────────────── */
function SimulateDialog({ card, onClose }: { card: OverviewCard; onClose: () => void }) {
  const [zone, setZone] = React.useState<string>(RATE_CARD_ZONES[0].code);
  const [weight, setWeight] = React.useState("1000");
  const [service, setService] = React.useState("surface");
  const [result, setResult] = React.useState<RateSimResult | null>(null);

  const simM = useMutation({
    mutationFn: () =>
      adminSimulateRateCard(card.id, {
        weight_grams: Number(weight) || 0,
        zone_code: zone,
        service,
      }),
    onSuccess: (r) => setResult(r),
    onError: (e) => {
      setResult(null);
      toast.error(e instanceof ApiError ? e.message : "Couldn't simulate this card");
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="ratecard-simulate-dialog">
        <DialogHeader>
          <DialogTitle>Simulate — {card.name}</DialogTitle>
          <DialogDescription>Preview what this card charges for a lane and weight.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Zone</Label>
              <Select value={zone} onValueChange={setZone}>
                <SelectTrigger data-testid="ratecard-sim-zone-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATE_CARD_ZONES.map((z) => (
                    <SelectItem key={z.code} value={z.code}>
                      {z.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-sim-weight">Weight (g)</Label>
              <Input
                id="rc-sim-weight"
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="font-mono tabular-nums"
                data-testid="ratecard-sim-weight-input"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Service</Label>
            <Select value={service} onValueChange={setService}>
              <SelectTrigger data-testid="ratecard-sim-service-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="surface">Surface</SelectItem>
                <SelectItem value="express">Express</SelectItem>
                <SelectItem value="same_day">Same-day</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="gradient"
            className="group w-full"
            onClick={() => simM.mutate()}
            disabled={simM.isPending}
            data-testid="ratecard-sim-run-btn"
          >
            <Icon name="calculator" trigger="group-hover" size={16} className="text-white" />
            {simM.isPending ? "Calculating…" : "Simulate"}
          </Button>

          {result && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4" data-testid="ratecard-sim-result">
              <div className="flex items-center justify-between">
                <Badge variant="gradient">{result.zoneLabel}</Badge>
                <span className="text-sm text-muted-foreground">
                  {result.serviceLabel} · {result.etaDays[0]}–{result.etaDays[1]} days
                </span>
              </div>
              <div className="space-y-1">
                {result.breakdown.map((l) => (
                  <div key={l.label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{l.label}</span>
                    <span className="font-mono tabular-nums">{formatCurrency(l.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
                <span>Total</span>
                <span className="font-mono tabular-nums" data-testid="ratecard-sim-total">
                  {formatCurrency(result.total)}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="ratecard-sim-close-btn">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
