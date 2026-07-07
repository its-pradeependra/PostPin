import { ZONE_PRICING } from "@/data/zones.data.js";
import { PincodeModel, RateCardModel, ZoneModel } from "@/models/index.js";

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

// ── Assigned rate card → keyed pricing ──────────────────────────────────────
export interface CardSlab {
  zoneCode: string;
  fromWeightG?: number;
  toWeightG?: number | null;
  baseChargePaise?: number;
  stepWeightG?: number;
  stepChargePaise?: number;
}
export interface CardLike {
  slabs?: CardSlab[];
}

/** Freight (paise) for a zone+weight from a rate card's slabs, or null if the
 * card has no slab for the zone. Shared by the engine and admin simulation. */
export function cardFreightPaise(card: CardLike, zoneCode: string, chargeableGrams: number): number | null {
  const slabs = (card.slabs ?? [])
    .filter((s) => s.zoneCode === zoneCode)
    .sort((a, b) => (a.fromWeightG ?? 0) - (b.fromWeightG ?? 0));
  if (slabs.length === 0) return null;
  let slab = slabs.find((s) => chargeableGrams >= (s.fromWeightG ?? 0) && (s.toWeightG == null || chargeableGrams < s.toWeightG));
  if (!slab) slab = slabs[slabs.length - 1]!;
  const step = slab.stepWeightG || 500;
  const base = slab.baseChargePaise ?? 0;
  // Open-ended slab → charge per step over the first bucket; closed band → flat base.
  const overageUnits = slab.toWeightG == null ? Math.max(0, Math.ceil((chargeableGrams - Math.max(slab.fromWeightG ?? 0, 500)) / step)) : 0;
  return base + overageUnits * (slab.stepChargePaise ?? 0);
}

let cardCache = new Map<string, { card: CardLike | null; at: number }>();
const CARD_TTL_MS = 15_000;

export function invalidateCardCache(companyId?: string): void {
  if (companyId) cardCache.delete(companyId);
  else cardCache = new Map();
}

async function activeCardFor(companyId: string): Promise<CardLike | null> {
  const hit = cardCache.get(companyId);
  if (hit && Date.now() - hit.at < CARD_TTL_MS) return hit.card;
  const card = (await RateCardModel.findOne({ companyId, status: "active", isDefault: true, isDeleted: false })
    .select("slabs")
    .lean()) as CardLike | null;
  cardCache.set(companyId, { card: card ?? null, at: Date.now() });
  return card ?? null;
}

export interface CardSimInput {
  weightGrams: number;
  zoneCode: string;
  service?: ServiceLevel;
  cod?: boolean;
  declaredValuePaise?: number;
}

/** Preview a card's price for a zone+weight without touching pincodes — powers
 * the admin "simulate" action. Returns null if the card doesn't price the zone. */
export async function simulateCardQuote(card: CardLike, input: CardSimInput): Promise<RateResultDTO | null> {
  const zone = input.zoneCode;
  const svc = SERVICE[input.service ?? "surface"];
  const chargeable = Math.max(input.weightGrams, 0);
  const freight = cardFreightPaise(card, zone, chargeable);
  if (freight == null) return null;

  const DEFAULTS = await getEngineDefaults();
  const multBps = serviceMultBps(DEFAULTS, input.service ?? "surface");
  const basePaise = Math.round((freight * multBps) / 10_000);
  const fuelPaise = Math.round((basePaise * DEFAULTS.fuelBps) / 10_000);
  const breakdown: RateBreakdownLine[] = [
    { label: "Rate card freight", amount: toRupees(basePaise), hint: `${ZONE_LABEL[zone] ?? zone} · ${svc.label}` },
    { label: "Fuel surcharge", amount: toRupees(fuelPaise), hint: pct(DEFAULTS.fuelBps) },
  ];
  let codPaise = 0;
  if (input.cod) {
    codPaise = DEFAULTS.codFlatPaise + Math.round(((input.declaredValuePaise ?? 0) * DEFAULTS.codPercentBps) / 10_000);
    breakdown.push({ label: "COD handling", amount: toRupees(codPaise), hint: `₹${Math.round(DEFAULTS.codFlatPaise) / 100} + ${pct(DEFAULTS.codPercentBps)}` });
  }
  const subtotalPaise = basePaise + fuelPaise + codPaise;
  const gstPaise = Math.round((subtotalPaise * DEFAULTS.gstBps) / 10_000);
  breakdown.push({ label: "GST", amount: toRupees(gstPaise), hint: pct(DEFAULTS.gstBps) });
  const totalPaise = subtotalPaise + gstPaise;
  const zp = ZONE_PRICING[zone] ?? ZONE_PRICING["roi"]!;

  return {
    zone,
    zoneLabel: ZONE_LABEL[zone] ?? zone,
    service: input.service ?? "surface",
    serviceLabel: svc.label,
    chargeableWeightGrams: chargeable,
    volumetricWeightGrams: 0,
    etaDays: [Math.max(1, zp.etaDays[0] + svc.etaDelta), Math.max(1, zp.etaDays[1] + svc.etaDelta)],
    currency: "INR",
    breakdown,
    total: toRupees(totalPaise),
    totalPaise,
    origin: { pincode: "", city: "", state: "" },
    destination: { pincode: "", city: "", state: "" },
    serviceable: true,
  };
}

export type ServiceLevel = "surface" | "air" | "express" | "same_day";

// Labels + ETA deltas only — price multipliers live in `engine.defaults`
// (expressMultBps / sameDayMultBps) so the superadmin can edit them.
const SERVICE: Record<ServiceLevel, { label: string; etaDelta: number }> = {
  surface: { label: "Surface", etaDelta: 0 },
  air: { label: "Air", etaDelta: -1 },
  express: { label: "Express", etaDelta: -1 },
  same_day: { label: "Same-day", etaDelta: -2 },
};

const ZONE_LABEL: Record<string, string> = {
  within_city: "Local",
  within_state: "Regional",
  metro: "Metro",
  roi: "National",
  ne_jk: "Special / Remote",
};

// Built-in fallback when the `engine.defaults` platform setting is absent.
const FALLBACK_DEFAULTS = {
  gstBps: 1800,
  fuelBps: 1200,
  codFlatPaise: 3500,
  codPercentBps: 150,
  volumetricDivisor: 5000,
  // Service-level price multipliers in basis points of the surface freight
  // (10000 = ×1). Surface is always ×1; these price the faster services.
  airMultBps: 14_000,
  expressMultBps: 16_000,
  sameDayMultBps: 28_000,
};
export type EngineDefaults = typeof FALLBACK_DEFAULTS;

/** Resolve the freight multiplier for a service level from the live defaults. */
export function serviceMultBps(defaults: EngineDefaults, service: ServiceLevel): number {
  if (service === "air") return defaults.airMultBps;
  if (service === "express") return defaults.expressMultBps;
  if (service === "same_day") return defaults.sameDayMultBps;
  return 10_000;
}
const SPECIAL_PREFIXES = ["19", "18", "74", "79", "78", "73"];

// DB-backed engine defaults, cached like zone pricing. Admin edits to the
// `engine.defaults` setting call invalidateEngineDefaults() and take effect on
// the next quote — no restart needed.
let engineDefaultsCache: EngineDefaults | null = null;
let engineDefaultsAt = 0;
const ENGINE_DEFAULTS_TTL_MS = 30_000;

export function invalidateEngineDefaults(): void {
  engineDefaultsCache = null;
}

const numOr = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback);

export async function getEngineDefaults(): Promise<EngineDefaults> {
  if (engineDefaultsCache && Date.now() - engineDefaultsAt < ENGINE_DEFAULTS_TTL_MS) return engineDefaultsCache;
  try {
    const { SettingsModel } = await import("@/models/index.js");
    const s = await SettingsModel.findOne({ scope: "platform", key: "engine.defaults" }).lean();
    const v = (s?.value ?? {}) as Partial<Record<keyof EngineDefaults, unknown>>;
    engineDefaultsCache = {
      gstBps: numOr(v.gstBps, FALLBACK_DEFAULTS.gstBps),
      fuelBps: numOr(v.fuelBps, FALLBACK_DEFAULTS.fuelBps),
      codFlatPaise: numOr(v.codFlatPaise, FALLBACK_DEFAULTS.codFlatPaise),
      codPercentBps: numOr(v.codPercentBps, FALLBACK_DEFAULTS.codPercentBps),
      volumetricDivisor: numOr(v.volumetricDivisor, FALLBACK_DEFAULTS.volumetricDivisor) || FALLBACK_DEFAULTS.volumetricDivisor,
      // Faster services can never be cheaper than surface (×1 = 10000 bps).
      airMultBps: Math.max(10_000, numOr(v.airMultBps, FALLBACK_DEFAULTS.airMultBps)),
      expressMultBps: Math.max(10_000, numOr(v.expressMultBps, FALLBACK_DEFAULTS.expressMultBps)),
      sameDayMultBps: Math.max(10_000, numOr(v.sameDayMultBps, FALLBACK_DEFAULTS.sameDayMultBps)),
    };
    engineDefaultsAt = Date.now();
    return engineDefaultsCache;
  } catch {
    return FALLBACK_DEFAULTS; // DB unavailable → seed values, uncached
  }
}

const pct = (bps: number) => `${Math.round(bps) / 100}%`;

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
  /** Keyed calls pass the caller's companyId so an assigned rate card prices the lane. */
  companyId?: string;
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
  const [oMeta, dMeta, DEFAULTS] = await Promise.all([
    resolvePincode(input.origin),
    resolvePincode(input.destination),
    getEngineDefaults(),
  ]);
  const zone = classifyZone(input.origin, input.destination, oMeta, dMeta);
  const pricing = await getZonePricing(zone);
  const svc = SERVICE[input.service];
  const multBps = serviceMultBps(DEFAULTS, input.service);

  const volGrams = volumetricGrams(DEFAULTS.volumetricDivisor, input.length, input.width, input.height);
  const chargeable = Math.max(input.weightGrams, volGrams);
  const chargeableKg = Math.max(0.5, chargeable / 1000);
  const billableKg = Math.ceil(chargeableKg * 2) / 2;

  // Keyed calls with an assigned (active + default) rate card price from that
  // card's slabs; everyone else uses the zone pricing. Falls back cleanly when
  // the caller has no card, so anonymous/unassigned pricing is unchanged.
  let cardFreight: number | null = null;
  if (input.companyId) {
    const card = await activeCardFor(input.companyId);
    if (card) cardFreight = cardFreightPaise(card, zone, chargeable);
  }

  let basePaise: number;
  let weightPaise: number;
  const breakdown: RateBreakdownLine[] = [];
  if (cardFreight != null) {
    basePaise = Math.round((cardFreight * multBps) / 10_000);
    weightPaise = 0;
    breakdown.push({ label: "Rate card freight", amount: toRupees(basePaise), hint: `${ZONE_LABEL[zone] ?? zone} · ${svc.label}` });
  } else {
    basePaise = Math.round((pricing.baseChargePaise * multBps) / 10_000);
    weightPaise = Math.round((billableKg * pricing.perKgPaise * multBps) / 10_000);
    breakdown.push(
      { label: "Base charge", amount: toRupees(basePaise), hint: `${ZONE_LABEL[zone] ?? zone} · ${svc.label}` },
      { label: "Weight charge", amount: toRupees(weightPaise), hint: `${billableKg.toFixed(2)} kg billable` },
    );
  }
  const fuelPaise = Math.round(((basePaise + weightPaise) * DEFAULTS.fuelBps) / 10_000);
  breakdown.push({ label: "Fuel surcharge", amount: toRupees(fuelPaise), hint: pct(DEFAULTS.fuelBps) });

  let codPaise = 0;
  if (input.cod) {
    codPaise = DEFAULTS.codFlatPaise + Math.round(((input.declaredValuePaise ?? 0) * DEFAULTS.codPercentBps) / 10_000);
    breakdown.push({ label: "COD handling", amount: toRupees(codPaise), hint: `₹${Math.round(DEFAULTS.codFlatPaise) / 100} + ${pct(DEFAULTS.codPercentBps)}` });
  }

  const subtotalPaise = basePaise + weightPaise + fuelPaise + codPaise;
  const gstPaise = Math.round((subtotalPaise * DEFAULTS.gstBps) / 10_000);
  breakdown.push({ label: "GST", amount: toRupees(gstPaise), hint: pct(DEFAULTS.gstBps) });
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
