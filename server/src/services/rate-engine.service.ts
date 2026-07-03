import { ZONE_PRICING } from "@/data/zones.data.js";
import { PincodeModel, ZoneModel } from "@/models/index.js";

export interface ZonePricing {
  baseChargePaise: number;
  perKgPaise: number;
  etaDays: [number, number];
}

// DB-backed zone pricing, cached so the hot path stays a Map lookup. Admin zone
// edits call invalidateZonePricing() so changes take effect immediately; the
// built-in ZONE_PRICING seed is the fallback for any unset field.
let zonePricingCache: Map<string, ZonePricing> | null = null;
let zonePricingAt = 0;
const ZONE_PRICING_TTL_MS = 30_000;

export function invalidateZonePricing(): void {
  zonePricingCache = null;
}

async function loadZonePricing(): Promise<Map<string, ZonePricing>> {
  const zones = await ZoneModel.find({ isActive: true }).select("code baseChargePaise perKgPaise slaDays").lean();
  const m = new Map<string, ZonePricing>();
  for (const z of zones) {
    const code = z.code as string;
    const fb = ZONE_PRICING[code] ?? ZONE_PRICING["roi"]!;
    m.set(code, {
      baseChargePaise: z.baseChargePaise ?? fb.baseChargePaise,
      perKgPaise: z.perKgPaise ?? fb.perKgPaise,
      etaDays: [z.slaDays?.min ?? fb.etaDays[0], z.slaDays?.max ?? fb.etaDays[1]],
    });
  }
  return m;
}

export async function getZonePricing(code: string): Promise<ZonePricing> {
  if (!zonePricingCache || Date.now() - zonePricingAt > ZONE_PRICING_TTL_MS) {
    try {
      zonePricingCache = await loadZonePricing();
      zonePricingAt = Date.now();
    } catch {
      // DB unavailable → fall back to the built-in seed without caching.
      return ZONE_PRICING[code] ?? ZONE_PRICING["roi"]!;
    }
  }
  return zonePricingCache.get(code) ?? zonePricingCache.get("roi") ?? ZONE_PRICING[code] ?? ZONE_PRICING["roi"]!;
}

export type ServiceLevel = "surface" | "express" | "same_day";

const SERVICE: Record<ServiceLevel, { label: string; multBps: number; etaDelta: number }> = {
  surface: { label: "Surface", multBps: 10_000, etaDelta: 0 },
  express: { label: "Express", multBps: 16_000, etaDelta: -1 },
  same_day: { label: "Same-day", multBps: 28_000, etaDelta: -2 },
};

const ZONE_LABEL: Record<string, string> = {
  within_city: "Local",
  within_state: "Regional",
  metro: "Metro",
  roi: "National",
  ne_jk: "Special / Remote",
};

// Engine defaults (mirror the seeded `engine.defaults` platform setting).
const DEFAULTS = { gstBps: 1800, fuelBps: 1200, codFlatPaise: 3500, codPercentBps: 150, volumetricDivisor: 5000 };
const SPECIAL_PREFIXES = ["19", "18", "74", "79", "78", "73"];

export interface RateInput {
  origin: string;
  destination: string;
  weightGrams: number;
  length?: number;
  width?: number;
  height?: number;
  service: ServiceLevel;
  cod?: boolean;
  declaredValuePaise?: number;
}

interface PinMeta {
  city: string;
  state: string;
  isMetro: boolean;
  serviceable: boolean;
}

export async function resolvePincode(pin: string): Promise<PinMeta | null> {
  const doc = await PincodeModel.findOne({ pincode: pin, status: "active" }).lean();
  if (!doc) return null;
  return {
    city: doc.city ?? doc.district ?? "",
    state: doc.state ?? "",
    isMetro: Boolean(doc.isMetro),
    serviceable: doc.serviceable?.prepaid ?? true,
  };
}

export function classifyZone(origin: string, destination: string, oMeta: PinMeta | null, dMeta: PinMeta | null): string {
  if (!/^\d{6}$/.test(origin) || !/^\d{6}$/.test(destination)) return "roi";
  const o2 = origin.slice(0, 2);
  const d2 = destination.slice(0, 2);
  if (SPECIAL_PREFIXES.includes(o2) || SPECIAL_PREFIXES.includes(d2)) return "ne_jk";
  if (origin.slice(0, 3) === destination.slice(0, 3)) return "within_city";
  if (o2 === d2) return "within_state";
  if (oMeta?.isMetro && dMeta?.isMetro) return "metro";
  return "roi";
}

function volumetricGrams(divisor: number, l?: number, w?: number, h?: number): number {
  if (!l || !w || !h) return 0;
  return Math.round(((l * w * h) / divisor) * 1000);
}

const toRupees = (paise: number) => Math.round(paise) / 100;

export interface RateBreakdownLine {
  label: string;
  amount: number; // rupees
  hint?: string;
}

export interface RateResultDTO {
  zone: string;
  zoneLabel: string;
  service: ServiceLevel;
  serviceLabel: string;
  chargeableWeightGrams: number;
  volumetricWeightGrams: number;
  etaDays: [number, number];
  currency: "INR";
  breakdown: RateBreakdownLine[];
  total: number; // rupees
  totalPaise: number;
  origin: { pincode: string; city: string; state: string };
  destination: { pincode: string; city: string; state: string };
  serviceable: boolean;
}

export async function calculateRate(input: RateInput): Promise<RateResultDTO> {
  const [oMeta, dMeta] = await Promise.all([resolvePincode(input.origin), resolvePincode(input.destination)]);
  const zone = classifyZone(input.origin, input.destination, oMeta, dMeta);
  const pricing = await getZonePricing(zone);
  const svc = SERVICE[input.service];

  const volGrams = volumetricGrams(DEFAULTS.volumetricDivisor, input.length, input.width, input.height);
  const chargeable = Math.max(input.weightGrams, volGrams);
  const chargeableKg = Math.max(0.5, chargeable / 1000);
  const billableKg = Math.ceil(chargeableKg * 2) / 2;

  const basePaise = Math.round((pricing.baseChargePaise * svc.multBps) / 10_000);
  const weightPaise = Math.round((billableKg * pricing.perKgPaise * svc.multBps) / 10_000);
  const fuelPaise = Math.round(((basePaise + weightPaise) * DEFAULTS.fuelBps) / 10_000);

  const breakdown: RateBreakdownLine[] = [
    { label: "Base charge", amount: toRupees(basePaise), hint: `${ZONE_LABEL[zone] ?? zone} · ${svc.label}` },
    { label: "Weight charge", amount: toRupees(weightPaise), hint: `${billableKg.toFixed(2)} kg billable` },
    { label: "Fuel surcharge", amount: toRupees(fuelPaise), hint: "12%" },
  ];

  let codPaise = 0;
  if (input.cod) {
    codPaise = DEFAULTS.codFlatPaise + Math.round(((input.declaredValuePaise ?? 0) * DEFAULTS.codPercentBps) / 10_000);
    breakdown.push({ label: "COD handling", amount: toRupees(codPaise), hint: "₹35 + 1.5%" });
  }

  const subtotalPaise = basePaise + weightPaise + fuelPaise + codPaise;
  const gstPaise = Math.round((subtotalPaise * DEFAULTS.gstBps) / 10_000);
  breakdown.push({ label: "GST", amount: toRupees(gstPaise), hint: "18%" });
  const totalPaise = subtotalPaise + gstPaise;

  const etaLow = Math.max(1, pricing.etaDays[0] + svc.etaDelta);
  const etaHigh = Math.max(etaLow, pricing.etaDays[1] + svc.etaDelta);

  return {
    zone,
    zoneLabel: ZONE_LABEL[zone] ?? zone,
    service: input.service,
    serviceLabel: svc.label,
    chargeableWeightGrams: chargeable,
    volumetricWeightGrams: volGrams,
    etaDays: [etaLow, etaHigh],
    currency: "INR",
    breakdown,
    total: toRupees(totalPaise),
    totalPaise,
    origin: { pincode: input.origin, city: oMeta?.city ?? "Unknown", state: oMeta?.state ?? "—" },
    destination: { pincode: input.destination, city: dMeta?.city ?? "Unknown", state: dMeta?.state ?? "—" },
    serviceable:
      /^\d{6}$/.test(input.origin) &&
      /^\d{6}$/.test(input.destination) &&
      (oMeta?.serviceable ?? true) &&
      (dMeta?.serviceable ?? true),
  };
}
