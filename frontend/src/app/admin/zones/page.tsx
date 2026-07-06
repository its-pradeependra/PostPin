"use client";

import * as React from "react";
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
import { Switch } from "@/components/ui/switch";
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
import { Separator } from "@/components/ui/separator";

import { listAdminZones, updateAdminZone, type AdminZone, type ZonePatch } from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";
import { formatCurrency } from "@/lib/format";

/* ──────────────────────────────────────────────────────────────────
   Zone tier -> badge accent. Special zones always render destructive.
   ────────────────────────────────────────────────────────────────── */
const TIER_BADGE: Record<number, React.ComponentProps<typeof Badge>["variant"]> = {
  1: "info",
  2: "default",
  3: "gradient",
  4: "secondary",
};

function zoneBadgeVariant(zone: AdminZone) {
  if (zone.is_special) return "destructive" as const;
  return TIER_BADGE[zone.tier] ?? "secondary";
}

interface ZoneEditorState {
  name: string;
  description: string;
  tier: string;
  priority: string;
  slaMin: string;
  slaMax: string;
  baseCharge: string;
  perKg: string;
  isSpecial: boolean;
  isActive: boolean;
}

function editorFromZone(z: AdminZone): ZoneEditorState {
  return {
    name: z.name,
    description: z.description,
    tier: String(z.tier),
    priority: String(z.priority),
    slaMin: String(z.sla_days.min),
    slaMax: String(z.sla_days.max),
    baseCharge: z.base_charge != null ? String(z.base_charge) : "",
    perKg: z.per_kg != null ? String(z.per_kg) : "",
    isSpecial: z.is_special,
    isActive: z.is_active,
  };
}

export default function AdminZonesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "zones"], queryFn: listAdminZones });
  const zones = q.data ?? [];
  const specialZones = zones.filter((z) => z.is_special);

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingCode, setEditingCode] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const [form, setForm] = React.useState<ZoneEditorState | null>(null);

  const saveM = useMutation({
    mutationFn: ({ code, patch }: { code: string; patch: ZonePatch }) => updateAdminZone(code, patch),
    onSuccess: (zone) => {
      void qc.invalidateQueries({ queryKey: ["admin", "zones"] });
      toast.success(`Zone “${zone.name}” updated — new pricing applies to the next quote.`);
      setEditorOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save the zone"),
  });

  function openEdit(zone: AdminZone) {
    setEditingCode(zone.code);
    setEditingName(zone.name);
    setForm(editorFromZone(zone));
    setEditorOpen(true);
  }

  const setField = <K extends keyof ZoneEditorState>(key: K, value: ZoneEditorState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  function handleSave() {
    if (!editingCode || !form) return;
    if (!form.name.trim()) {
      toast.error("Zone name is required.");
      return;
    }
    const num = (v: string) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const patch: ZonePatch = {
      name: form.name.trim(),
      description: form.description.trim(),
      tier: num(form.tier),
      priority: num(form.priority),
      sla_min: num(form.slaMin),
      sla_max: num(form.slaMax),
      is_special: form.isSpecial,
      is_active: form.isActive,
    };
    if (form.baseCharge.trim() !== "") patch.base_charge = num(form.baseCharge);
    if (form.perKg.trim() !== "") patch.per_kg = num(form.perKg);
    saveM.mutate({ code: editingCode, patch });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Zones"
        description="The zone bands the rate engine classifies every origin → destination lane into — each band carries the base charge, per-kg rate and delivery SLA it prices with. Edit a band to reprice the live engine."
      />

      {/* Explainer */}
      <Card data-testid="zone-explainer-card" className="border-primary/20 bg-brand-gradient-soft">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-sm">
            <Icon name="zones" size={22} />
          </span>
          <div className="space-y-1">
            <p className="font-display text-sm font-semibold">How zones work</p>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Every rate request classifies the origin and destination pincodes into one of the
              zone bands below. The band selects the base charge, per-kg rate and delivery SLA
              the engine quotes. Edits take effect on the next quote — the pincode → zone
              classification rules themselves are unchanged.
            </p>
          </div>
        </CardContent>
      </Card>

      <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
        {/* Zone grid */}
        <section className="space-y-3" data-testid="zone-grid-section">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-lg font-semibold">Zone definitions</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {zones.length} zones
            </span>
          </div>

          {zones.length === 0 ? (
            <EmptyState
              icon="zones"
              title="No zones defined"
              description="The rate engine hasn't published any zone bands yet."
              testId="zone-empty-state"
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {zones.map((zone) => (
                <ZoneCard key={zone.id} zone={zone} onEdit={() => openEdit(zone)} />
              ))}
            </div>
          )}
        </section>

        {/* Special zones */}
        <Card data-testid="zone-remote-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="pin" size={18} className="text-destructive" />
              Special zones
            </CardTitle>
            <CardDescription>
              Special-handling bands with their own pricing and extended delivery SLAs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {specialZones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No special zones configured.</p>
            ) : (
              specialZones.map((zone) => {
                const code = slug(zone.code);
                return (
                  <div key={zone.id} data-testid={`zone-remote-${code}`} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {zone.name}{" "}
                        <span className="font-mono text-xs text-muted-foreground">
                          {zone.code}
                        </span>
                      </span>
                      <Badge variant="destructive" data-testid={`zone-remote-eta-${code}`}>
                        {zone.sla_days.min}–{zone.sla_days.max} days
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{zone.description}</p>
                    <p className="font-mono text-xs text-muted-foreground tabular-nums">
                      Base {zone.base_charge != null ? formatCurrency(zone.base_charge) : "—"} ·{" "}
                      {zone.per_kg != null ? `${formatCurrency(zone.per_kg)}/kg` : "—"}
                    </p>
                  </div>
                );
              })
            )}
          </CardContent>
          <CardFooter className="pt-0">
            <p className="text-xs text-muted-foreground">
              Special zones apply their own base &amp; per-kg rates and carry a longer delivery
              window.
            </p>
          </CardFooter>
        </Card>
      </QueryBoundary>

      {/* ── Zone editor dialog ── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="zone-editor-dialog">
          <DialogHeader>
            <DialogTitle>Edit zone — {editingName}</DialogTitle>
            <DialogDescription>
              Reprice this band or adjust its SLA. Changes apply to the next quote the engine
              computes; the code (<span className="font-mono">{editingCode}</span>) is immutable.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label htmlFor="zone-name">Name</Label>
                <Input
                  id="zone-name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  data-testid="zone-name-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zone-description">Description</Label>
                <Input
                  id="zone-description"
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  data-testid="zone-description-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="zone-base">Base charge (₹)</Label>
                  <Input
                    id="zone-base"
                    type="number"
                    value={form.baseCharge}
                    onChange={(e) => setField("baseCharge", e.target.value)}
                    className="font-mono tabular-nums"
                    data-testid="zone-base-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="zone-perkg">Per kg (₹)</Label>
                  <Input
                    id="zone-perkg"
                    type="number"
                    value={form.perKg}
                    onChange={(e) => setField("perKg", e.target.value)}
                    className="font-mono tabular-nums"
                    data-testid="zone-perkg-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="zone-sla-min">SLA min (days)</Label>
                  <Input
                    id="zone-sla-min"
                    type="number"
                    value={form.slaMin}
                    onChange={(e) => setField("slaMin", e.target.value)}
                    className="font-mono tabular-nums"
                    data-testid="zone-sla-min-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="zone-sla-max">SLA max (days)</Label>
                  <Input
                    id="zone-sla-max"
                    type="number"
                    value={form.slaMax}
                    onChange={(e) => setField("slaMax", e.target.value)}
                    className="font-mono tabular-nums"
                    data-testid="zone-sla-max-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="zone-tier">Tier</Label>
                  <Input
                    id="zone-tier"
                    type="number"
                    value={form.tier}
                    onChange={(e) => setField("tier", e.target.value)}
                    className="font-mono tabular-nums"
                    data-testid="zone-tier-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="zone-priority">Match priority</Label>
                  <Input
                    id="zone-priority"
                    type="number"
                    value={form.priority}
                    onChange={(e) => setField("priority", e.target.value)}
                    className="font-mono tabular-nums"
                    data-testid="zone-priority-input"
                  />
                  <p className="text-xs text-muted-foreground">Lower is checked first.</p>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border bg-brand-gradient-soft/40 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="zone-special" className="text-sm font-medium">Special zone</Label>
                    <p className="text-xs text-muted-foreground">Extended handling &amp; SLA.</p>
                  </div>
                  <Switch
                    id="zone-special"
                    checked={form.isSpecial}
                    onCheckedChange={(v) => setField("isSpecial", v)}
                    data-testid="zone-special-switch"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="zone-active" className="text-sm font-medium">Active</Label>
                    <p className="text-xs text-muted-foreground">Inactive zones fall back to National pricing.</p>
                  </div>
                  <Switch
                    id="zone-active"
                    checked={form.isActive}
                    onCheckedChange={(v) => setField("isActive", v)}
                    data-testid="zone-active-switch"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} data-testid="zone-editor-cancel-btn">
              Cancel
            </Button>
            <Button
              variant="gradient"
              onClick={handleSave}
              disabled={saveM.isPending}
              data-testid="zone-editor-save-btn"
            >
              <Icon name="check" trigger="group-hover" size={16} className="text-white" />
              {saveM.isPending ? "Saving…" : "Save zone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Zone card
   ────────────────────────────────────────────────────────────────── */
function ZoneCard({ zone, onEdit }: { zone: AdminZone; onEdit: () => void }) {
  const code = slug(zone.code);
  return (
    <Card data-testid={`zone-card-${code}`} className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Badge variant={zoneBadgeVariant(zone)} data-testid={`zone-badge-${code}`}>
                {zone.name}
              </Badge>
              <span
                className="font-mono text-xs text-muted-foreground"
                data-testid={`zone-code-${code}`}
              >
                {zone.code}
              </span>
            </CardTitle>
            <CardDescription>{zone.description}</CardDescription>
          </div>
          <Badge
            variant="outline"
            className="shrink-0 tabular-nums"
            data-testid={`zone-tier-${code}`}
          >
            Tier {zone.tier}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1" data-testid={`zone-eta-${code}`}>
            <Icon name="clock" size={12} />
            {zone.sla_days.min}–{zone.sla_days.max} days
          </Badge>
          {zone.is_special && (
            <Badge variant="destructive" data-testid={`zone-flag-special-${code}`}>
              Special
            </Badge>
          )}
          <StatusBadge
            status={zone.is_active ? "active" : "inactive"}
            testId={`zone-flag-active-${code}`}
          />
        </div>

        <Separator />

        {/* Live engine pricing */}
        <dl className="grid grid-cols-2 gap-3" data-testid={`zone-pricing-${code}`}>
          <div className="space-y-0.5">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Base charge
            </dt>
            <dd
              className="font-mono text-sm font-semibold tabular-nums"
              data-testid={`zone-base-${code}`}
            >
              {zone.base_charge != null ? formatCurrency(zone.base_charge) : "—"}
            </dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Per kg</dt>
            <dd
              className="font-mono text-sm font-semibold tabular-nums"
              data-testid={`zone-perkg-${code}`}
            >
              {zone.per_kg != null ? `${formatCurrency(zone.per_kg)}/kg` : "—"}
            </dd>
          </div>
        </dl>
      </CardContent>

      <CardFooter className="pt-0">
        <Button
          variant="outline"
          size="sm"
          className="group w-full"
          onClick={onEdit}
          data-testid={`zone-edit-btn-${code}`}
        >
          <Icon name="edit" trigger="group-hover" size={14} />
          Edit zone
        </Button>
      </CardFooter>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────── */
function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
