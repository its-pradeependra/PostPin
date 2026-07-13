"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Number input with a unit suffix rendered inside the field. */
function UnitInput({
  id,
  label,
  unit,
  value,
  onChange,
  testId,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          className="h-11 pr-10 font-mono text-base tabular-nums"
          data-testid={testId}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
          {unit}
        </span>
      </div>
    </div>
  );
}

/** Proportional weight bar for the actual-vs-volumetric comparison. */
function WeightBar({
  label,
  kg,
  max,
  winner,
  testId,
}: {
  label: string;
  kg: number;
  max: number;
  winner: boolean;
  testId?: string;
}) {
  const pct = max > 0 ? Math.max((kg / max) * 100, kg > 0 ? 6 : 0) : 0;
  const fmt = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(2));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className={cn("font-medium", winner ? "text-foreground" : "text-muted-foreground")}>
          {label}
        </span>
        <span
          className={cn("font-mono font-semibold tabular-nums", winner ? "text-foreground" : "text-muted-foreground")}
          data-testid={testId}
        >
          {kg > 0 ? `${fmt(kg)} kg` : "—"}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            winner ? "bg-brand-gradient" : "bg-border",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function VolumetricCalculator() {
  const [length, setLength] = React.useState("30");
  const [width, setWidth] = React.useState("22");
  const [height, setHeight] = React.useState("15");
  const [actualKg, setActualKg] = React.useState("1");
  const [divisor, setDivisor] = React.useState("5000");

  const l = num(length);
  const w = num(width);
  const h = num(height);
  const actual = num(actualKg);
  const div = num(divisor) || 5000;

  const volumetric = l && w && h ? (l * w * h) / div : 0;
  const chargeable = Math.max(actual, volumetric);
  const billedVolumetric = volumetric > actual && volumetric > 0;
  const maxKg = Math.max(actual, volumetric);
  const fmt = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(2));

  return (
    <Card className="overflow-hidden" data-testid="volumetric-calc-card">
      <div className="grid lg:grid-cols-[1.05fr_1fr]">
        {/* ── Inputs ── */}
        <div className="space-y-6 p-6 sm:p-8">
          <div>
            <p className="flex items-center gap-2 font-display text-sm font-semibold">
              <Icon name="boxes" size={16} className="text-primary" />
              Parcel dimensions
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <UnitInput id="vol-length" label="Length" unit="cm" value={length} onChange={setLength} testId="volumetric-length-input" />
              <UnitInput id="vol-width" label="Width" unit="cm" value={width} onChange={setWidth} testId="volumetric-width-input" />
              <UnitInput id="vol-height" label="Height" unit="cm" value={height} onChange={setHeight} testId="volumetric-height-input" />
            </div>
          </div>

          <div>
            <p className="flex items-center gap-2 font-display text-sm font-semibold">
              <Icon name="gauge" size={16} className="text-primary" />
              Weight &amp; carrier divisor
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <UnitInput id="vol-actual" label="Actual weight" unit="kg" value={actualKg} onChange={setActualKg} testId="volumetric-actual-input" />
              <div className="space-y-1.5">
                <Label htmlFor="vol-divisor" className="text-xs text-muted-foreground">
                  Divisor
                </Label>
                <Select value={divisor} onValueChange={setDivisor}>
                  <SelectTrigger id="vol-divisor" className="h-11! font-mono" data-testid="volumetric-divisor-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5000">5000 — India domestic standard</SelectItem>
                    <SelectItem value="4500">4500 — some express carriers</SelectItem>
                    <SelectItem value="6000">6000 — some international lanes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Live formula — shows the actual math being applied */}
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3" data-testid="volumetric-formula-readout">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Formula</p>
            <p className="mt-1 font-mono text-sm tabular-nums">
              {l && w && h ? (
                <>
                  {l} × {w} × {h} ÷ {div} = <span className="font-semibold text-primary">{fmt(volumetric)} kg</span>
                </>
              ) : (
                <span className="text-muted-foreground">L × W × H (cm) ÷ {div} = volumetric kg</span>
              )}
            </p>
          </div>
        </div>

        {/* ── Result ── */}
        <div
          className="flex flex-col justify-center gap-6 border-t border-border bg-muted/30 p-6 sm:p-8 lg:border-l lg:border-t-0"
          data-testid="volumetric-result-panel"
        >
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Couriers will bill this parcel at
            </p>
            <p className="mt-1 font-display text-5xl font-bold leading-none tracking-tight" data-testid="volumetric-result-chargeable">
              {chargeable > 0 ? (
                <>
                  {fmt(chargeable)} <span className="text-2xl font-semibold text-muted-foreground">kg</span>
                </>
              ) : (
                "—"
              )}
            </p>
            {chargeable > 0 && (
              <Badge variant={billedVolumetric ? "warning" : "success"} className="mt-3" data-testid="volumetric-result-badge">
                <Icon name={billedVolumetric ? "boxes" : "gauge"} size={12} />
                {billedVolumetric
                  ? `Billed by volume — ${(volumetric / Math.max(actual, 0.01)).toFixed(1)}× the actual weight`
                  : "Billed by actual weight"}
              </Badge>
            )}
          </div>

          <div className="space-y-4">
            <WeightBar label="Actual weight" kg={actual} max={maxKg} winner={!billedVolumetric && actual > 0} />
            <WeightBar
              label="Volumetric weight"
              kg={volumetric}
              max={maxKg}
              winner={billedVolumetric}
              testId="volumetric-result-volumetric"
            />
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Couriers charge for whichever is higher. Bulky-but-light parcels are billed by the space they
            take in the van, not the scale weight.
          </p>
        </div>
      </div>
    </Card>
  );
}
