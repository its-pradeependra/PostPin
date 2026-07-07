"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { formatCurrency } from "@/lib/format";
import { calculatePublicRate, lookupPincodeArea } from "@/lib/api/services/rates";
import type { RateResult, ServiceLevel } from "@/lib/types";

const QUICK = [
  { code: "400001", city: "Mumbai" },
  { code: "110001", city: "Delhi" },
  { code: "560001", city: "Bengaluru" },
  { code: "700001", city: "Kolkata" },
  { code: "781001", city: "Guwahati" },
];

type AreaStatus = "idle" | "loading" | "found" | "unknown" | "error";
interface AreaState {
  status: AreaStatus;
  label: string;
}

/** Process-lifetime cache so re-typing or swapping pincodes resolves instantly. */
const areaCache = new Map<string, { found: boolean; city: string | null; state: string | null }>();

function areaLabel(a: { found: boolean; city: string | null; state: string | null }): AreaState {
  if (!a.found) return { status: "unknown", label: "Unknown area" };
  const label = a.city ? (a.state && a.state !== a.city ? `${a.city}, ${a.state}` : a.city) : "Serviceable area";
  return { status: "found", label };
}

/** Resolve the real area name for a 6-digit pincode from the live India Post
 * master (debounced + abortable + cached). Falls back to a neutral placeholder
 * for partial input or transient errors — never a misleading "Unknown area". */
function usePincodeArea(pincode: string, placeholder: string): AreaState {
  const [state, setState] = React.useState<AreaState>({ status: "idle", label: placeholder });

  React.useEffect(() => {
    if (!/^\d{6}$/.test(pincode)) {
      setState({ status: "idle", label: placeholder });
      return;
    }
    const cached = areaCache.get(pincode);
    if (cached) {
      setState(areaLabel(cached));
      return;
    }
    const ctrl = new AbortController();
    setState({ status: "loading", label: "Locating…" });
    const t = setTimeout(() => {
      lookupPincodeArea(pincode, ctrl.signal)
        .then((a) => {
          areaCache.set(pincode, { found: a.found, city: a.city, state: a.state });
          setState(areaLabel(a));
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setState({ status: "error", label: placeholder });
        });
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [pincode, placeholder]);

  return state;
}

interface RateCalculatorProps {
  compact?: boolean;
  className?: string;
  /** Compute a quote on mount. Off by default so the form greets users with an inviting state, not a presumptuous price. */
  autoCalculate?: boolean;
  onResult?: (
    result: RateResult,
    request: { origin: string; destination: string; weightGrams: number; service: ServiceLevel; cod: boolean },
  ) => void;
}

export function RateCalculator({
  compact = false,
  className,
  autoCalculate = false,
  onResult,
}: RateCalculatorProps) {
  const [origin, setOrigin] = React.useState("400001");
  const [destination, setDestination] = React.useState("110001");
  const [weight, setWeight] = React.useState("1200");
  const [service, setService] = React.useState<ServiceLevel>("express");
  const [cod, setCod] = React.useState(false);
  const [length, setLength] = React.useState("");
  const [width, setWidth] = React.useState("");
  const [height, setHeight] = React.useState("");
  const [showDims, setShowDims] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<RateResult | null>(null);

  const originValid = /^\d{6}$/.test(origin);
  const destValid = /^\d{6}$/.test(destination);
  const validPins = originValid && destValid;

  const originArea = usePincodeArea(origin, "Pickup pincode");
  const destArea = usePincodeArea(destination, "Delivery pincode");

  const submit = React.useCallback(async () => {
    if (!validPins) return;
    setLoading(true);
    const weightGrams = Number(weight) || 0;
    try {
      const { result: r } = await calculatePublicRate({
        origin,
        destination,
        weightGrams,
        service,
        cod,
        length: Number(length) || undefined,
        width: Number(width) || undefined,
        height: Number(height) || undefined,
        declaredValue: cod ? 1499 : undefined,
      });
      setResult(r);
      onResult?.(r, { origin, destination, weightGrams, service, cod });
    } catch {
      // Surface as "not serviceable" (e.g. invalid pincode / API unreachable).
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [origin, destination, weight, service, cod, length, width, height, validPins, onResult]);

  function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    submit();
  }

  function swap() {
    setOrigin(destination);
    setDestination(origin);
  }

  React.useEffect(() => {
    if (autoCalculate) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fieldRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  // ── Shared field fragments (used by both compact & full) ────────
  const pincodeRow = (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-1.5">
      {/* labels */}
      <Label htmlFor="calc-origin" className="text-xs text-muted-foreground">
        <Icon name="pin" size={13} className="text-primary" /> From
      </Label>
      <span aria-hidden className="size-9" />
      <Label htmlFor="calc-dest" className="text-xs text-muted-foreground">
        <Icon name="pin" size={13} className="text-fuchsia" /> To
      </Label>

      {/* inputs + swap */}
      <Input
        id="calc-origin"
        data-testid="calc-origin-input"
        inputMode="numeric"
        maxLength={6}
        value={origin}
        aria-invalid={origin.length > 0 && !originValid}
        onChange={(e) => setOrigin(e.target.value.replace(/\D/g, ""))}
        placeholder="400001"
        className="font-mono"
      />
      <button
        type="button"
        data-testid="calc-swap-btn"
        onClick={swap}
        aria-label="Swap origin and destination"
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-all hover:bg-accent hover:text-foreground active:scale-90",
          fieldRing,
        )}
      >
        <Icon name="sync" size={14} />
      </button>
      <Input
        id="calc-dest"
        data-testid="calc-destination-input"
        inputMode="numeric"
        maxLength={6}
        value={destination}
        aria-invalid={destination.length > 0 && !destValid}
        onChange={(e) => setDestination(e.target.value.replace(/\D/g, ""))}
        placeholder="110001"
        className="font-mono"
      />

      {/* captions — live area names from the India Post master */}
      <p
        data-testid="calc-origin-area"
        aria-live="polite"
        className={cn(
          "truncate text-[11px] font-medium leading-tight",
          originArea.status === "unknown" ? "text-destructive/80" : "text-muted-foreground",
        )}
      >
        {originArea.label}
      </p>
      <span aria-hidden />
      <p
        data-testid="calc-destination-area"
        aria-live="polite"
        className={cn(
          "truncate text-[11px] font-medium leading-tight",
          destArea.status === "unknown" ? "text-destructive/80" : "text-muted-foreground",
        )}
      >
        {destArea.label}
      </p>
    </div>
  );

  const weightServiceRow = (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="calc-weight" className="text-xs text-muted-foreground">Weight (grams)</Label>
        <Input
          id="calc-weight"
          data-testid="calc-weight-input"
          inputMode="numeric"
          value={weight}
          onChange={(e) => setWeight(e.target.value.replace(/\D/g, ""))}
          placeholder="1200"
          className="font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="calc-service" className="text-xs text-muted-foreground">Service</Label>
        <Select value={service} onValueChange={(v) => setService(v as ServiceLevel)}>
          <SelectTrigger id="calc-service" data-testid="calc-service-trigger">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="surface">Surface</SelectItem>
            <SelectItem value="air">Air</SelectItem>
            <SelectItem value="express">Express</SelectItem>
            <SelectItem value="same_day">Same-day</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const dimensionsBlock = (
    <div className="overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        data-testid="calc-dimensions-toggle"
        onClick={() => setShowDims((v) => !v)}
        aria-expanded={showDims}
        className={cn(
          "group flex h-11 w-full items-center justify-between px-3.5 text-sm font-medium transition-colors hover:bg-accent/60 focus-visible:bg-accent/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        )}
      >
        <span className="flex items-center gap-2">
          <Icon name="boxes" size={16} className="text-primary" />
          Package dimensions
          <span className="text-xs font-normal text-muted-foreground">optional</span>
        </span>
        <Icon
          name="chevronDown"
          size={16}
          className={cn("text-muted-foreground transition-transform duration-200", showDims && "rotate-180")}
        />
      </button>
      {showDims && (
        <div className="space-y-2.5 border-t border-border px-3.5 py-3.5">
          <div className="grid grid-cols-3 gap-2">
            <Input data-testid="calc-length-input" inputMode="numeric" value={length} onChange={(e) => setLength(e.target.value.replace(/\D/g, ""))} placeholder="L cm" className="font-mono" />
            <Input data-testid="calc-width-input" inputMode="numeric" value={width} onChange={(e) => setWidth(e.target.value.replace(/\D/g, ""))} placeholder="W cm" className="font-mono" />
            <Input data-testid="calc-height-input" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value.replace(/\D/g, ""))} placeholder="H cm" className="font-mono" />
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Chargeable weight = max(actual, L×W×H ÷ 5000). Leave blank to bill by actual weight.
          </p>
        </div>
      )}
    </div>
  );

  const codRow = (
    <label
      htmlFor="calc-cod-switch"
      className="flex h-11 cursor-pointer items-center justify-between rounded-lg border border-border px-3.5 transition-colors hover:bg-accent/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon name="wallet" size={16} className="text-primary" /> Cash on delivery
        <span className="text-xs font-normal text-muted-foreground">+ handling</span>
      </span>
      <Switch id="calc-cod-switch" checked={cod} onCheckedChange={setCod} data-testid="calc-cod-switch" />
    </label>
  );

  const submitButton = (
    <Button
      type="submit"
      variant="gradient"
      size="lg"
      disabled={!validPins || loading}
      aria-busy={loading}
      data-testid="calc-submit-btn"
      className="w-full"
    >
      {loading ? (
        <Icon name="sync" size={18} className="text-white" />
      ) : (
        <Icon name="calculator" size={18} className="text-white" />
      )}
      {loading ? "Calculating…" : "Calculate shipping"}
    </Button>
  );

  // ── Compact: one cohesive card with all inputs + inline result ─
  if (compact) {
    return (
      <form
        onSubmit={onSubmit}
        data-testid="rate-calculator"
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_60px_-22px] shadow-primary/25",
          className,
        )}
      >
        <span className="absolute inset-x-0 top-0 z-10 h-[3px] bg-brand-gradient" />
        <span className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-primary/[0.05] to-transparent" />
        <div className="relative flex items-center justify-between border-b border-border/70 px-5 py-4">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            Live quote
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] tracking-wide text-muted-foreground">
            <span className="rounded bg-success/12 px-1.5 py-0.5 font-semibold text-success">POST</span>
            /v1/rates
          </span>
        </div>

        <div className="space-y-3.5 p-5">
          {pincodeRow}
          {weightServiceRow}
          {dimensionsBlock}
          {codRow}
          {submitButton}
        </div>

        <ResultStrip result={result} loading={loading} />
      </form>
    );
  }

  // ── Full (playground): form + detailed breakdown ───────────────
  return (
    <div className={cn("grid gap-5 lg:grid-cols-[1.05fr_1fr]", className)} data-testid="rate-calculator">
      <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="space-y-4">
          {pincodeRow}
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button
                key={q.code}
                type="button"
                data-testid={`calc-quick-${q.code}`}
                onClick={() => setDestination(q.code)}
                className={cn(
                  "rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground",
                  fieldRing,
                )}
              >
                {q.city}
              </button>
            ))}
          </div>
          {weightServiceRow}
          {dimensionsBlock}
          {codRow}
          {submitButton}
        </div>
      </form>

      <div className="rounded-2xl border border-border bg-muted/30 p-5 shadow-sm">
        <RateResultView result={result} loading={loading} />
      </div>
    </div>
  );
}

/** Big rupee amount with de-emphasized paise so the rupees dominate. */
function Amount({ value, className }: { value: number; className?: string }) {
  const [whole, paise] = formatCurrency(value).split(".");
  return (
    <span className={cn("font-display font-bold tabular-nums", className)}>
      {whole}
      {paise && (
        <span className="align-baseline text-[0.5em] font-semibold text-muted-foreground">.{paise}</span>
      )}
    </span>
  );
}

/** Compact inline result strip for the hero widget. */
function ResultStrip({ result, loading }: { result: RateResult | null; loading?: boolean }) {
  const reduce = useReducedMotion();

  if (!result || !result.serviceable) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-between border-t border-primary/10 bg-muted/40 px-5 py-4 text-sm text-muted-foreground"
      >
        <span>{loading ? "Calculating your quote…" : "Hit Calculate for a live quote"}</span>
        <Icon name="truck" size={18} className="text-primary" />
      </div>
    );
  }
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="border-t border-primary/10 bg-gradient-to-br from-muted/60 to-accent/25 px-5 py-4"
    >
      <span className="sr-only">
        Total {formatCurrency(result.total)}, {result.serviceLabel}, {result.zoneLabel} zone,
        {` ${result.etaDays[0]} to ${result.etaDays[1]} days`}.
      </span>
      <AnimatePresence mode="wait">
        <motion.div
          key={result.total + result.service + result.zone}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.22 }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Total shipping charge
              </p>
              <Amount value={result.total} className="text-[2.5rem] leading-none tracking-[-0.02em]" />
            </div>
            <div className="space-y-1 pt-0.5 text-right">
              <span className="inline-flex items-center rounded-full border border-border/70 bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                {result.zoneLabel}
              </span>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {result.serviceLabel} · {result.etaDays[0]}-{result.etaDays[1]} days
              </p>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
            <Icon name="pin" size={11} className="text-primary" />
            {result.origin.city} → {result.destination.city} · GST included
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function RateResultView({ result, loading }: { result: RateResult | null; loading?: boolean }) {
  const reduce = useReducedMotion();

  if (loading && !result) {
    return (
      <div className="flex h-full min-h-56 items-center justify-center">
        <Icon name="sync" size={26} className="text-primary" />
      </div>
    );
  }
  if (!result) {
    return (
      <div className="flex h-full min-h-56 flex-col items-center justify-center text-center text-sm text-muted-foreground">
        <Icon name="truck" size={28} className="mb-2 text-primary" />
        Hit “Calculate shipping” to see your live quote.
      </div>
    );
  }
  if (!result.serviceable) {
    return (
      <div className="flex h-full min-h-56 flex-col items-center justify-center text-center">
        <Icon name="close" size={26} className="mb-2 text-destructive" />
        <p className="font-semibold">Not serviceable</p>
        <p className="text-sm text-muted-foreground">Check the origin and destination pincodes.</p>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">
        <motion.div
          key={result.total + result.zone + result.service}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.25 }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Total shipping charge
              </p>
              <Amount value={result.total} className="text-[2.75rem] leading-none tracking-[-0.02em]" />
            </div>
            <Badge variant="gradient">{result.zoneLabel}</Badge>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Service", value: result.serviceLabel },
              { label: "ETA", value: `${result.etaDays[0]}-${result.etaDays[1]} days` },
              { label: "Chargeable", value: `${(result.chargeableWeightGrams / 1000).toFixed(2)} kg` },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-background/70 px-2 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                <p className="mt-0.5 text-sm font-semibold">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-1.5">
            {result.breakdown.map((line) => (
              <div key={line.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {line.label}
                  {line.hint && <span className="ml-1.5 text-xs text-muted-foreground/70">({line.hint})</span>}
                </span>
                <span className="font-medium tabular-nums">{formatCurrency(line.amount)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(result.total)}</span>
            </div>
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon name="pin" size={12} className="text-primary" />
            {result.origin.city} → {result.destination.city}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
