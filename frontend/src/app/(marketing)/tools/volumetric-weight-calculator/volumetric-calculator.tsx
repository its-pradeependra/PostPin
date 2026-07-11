"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
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

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

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
  const fmt = (n: number) => (n >= 100 ? n.toFixed(0) : n.toFixed(2));

  return (
    <Card data-testid="volumetric-calc-card">
      <CardContent className="grid gap-6 p-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vol-length">Length (cm)</Label>
              <Input
                id="vol-length"
                inputMode="decimal"
                value={length}
                onChange={(e) => setLength(e.target.value.replace(/[^\d.]/g, ""))}
                className="font-mono"
                data-testid="volumetric-length-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vol-width">Width (cm)</Label>
              <Input
                id="vol-width"
                inputMode="decimal"
                value={width}
                onChange={(e) => setWidth(e.target.value.replace(/[^\d.]/g, ""))}
                className="font-mono"
                data-testid="volumetric-width-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vol-height">Height (cm)</Label>
              <Input
                id="vol-height"
                inputMode="decimal"
                value={height}
                onChange={(e) => setHeight(e.target.value.replace(/[^\d.]/g, ""))}
                className="font-mono"
                data-testid="volumetric-height-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vol-actual">Actual weight (kg)</Label>
              <Input
                id="vol-actual"
                inputMode="decimal"
                value={actualKg}
                onChange={(e) => setActualKg(e.target.value.replace(/[^\d.]/g, ""))}
                className="font-mono"
                data-testid="volumetric-actual-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vol-divisor">Divisor</Label>
              <Select value={divisor} onValueChange={setDivisor}>
                <SelectTrigger id="vol-divisor" data-testid="volumetric-divisor-select">
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

          <p className="text-xs leading-relaxed text-muted-foreground">
            Formula: (L × W × H in cm) ÷ divisor = volumetric weight in kg. Couriers bill the higher of
            actual and volumetric weight.
          </p>
        </div>

        {/* Result panel */}
        <div className="flex flex-col justify-center gap-3 rounded-xl bg-muted/40 p-5" data-testid="volumetric-result-panel">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Volumetric weight</span>
            <span className="font-mono font-semibold tabular-nums" data-testid="volumetric-result-volumetric">
              {volumetric ? `${fmt(volumetric)} kg` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Actual weight</span>
            <span className="font-mono font-semibold tabular-nums">{actual ? `${fmt(actual)} kg` : "—"}</span>
          </div>
          <div className="my-1 border-t border-border" />
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium">
              <Icon name="package" size={16} className="text-primary" /> Chargeable weight
            </span>
            <span className="font-display text-xl font-bold tabular-nums text-primary" data-testid="volumetric-result-chargeable">
              {chargeable ? `${fmt(chargeable)} kg` : "—"}
            </span>
          </div>
          {chargeable > 0 && (
            <Badge variant={billedVolumetric ? "warning" : "success"} className="w-fit" data-testid="volumetric-result-badge">
              {billedVolumetric
                ? `Billed by volume — ${(volumetric / Math.max(actual, 0.01)).toFixed(1)}× the actual weight`
                : "Billed by actual weight"}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
