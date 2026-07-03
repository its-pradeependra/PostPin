import type {
  RateRequest,
  RateResult,
  ServiceLevel,
  ShippingZone,
  RateBreakdownLine,
} from "./types";

/**
 * Postpin rate engine (mock but realistic).
 * Mirrors the contract the production Node.js API will expose, so the UI can be
 * wired to the real endpoint later with zero changes to component code.
 */

// A small, real sample of Indian pincodes used by the playground + autocomplete.
export const SAMPLE_PINCODES: Record<
  string,
  { city: string; state: string; zonePrefix: string; metro?: boolean }
> = {
  "110001": { city: "New Delhi", state: "Delhi", zonePrefix: "11", metro: true },
  "400001": { city: "Mumbai", state: "Maharashtra", zonePrefix: "40", metro: true },
  "560001": { city: "Bengaluru", state: "Karnataka", zonePrefix: "56", metro: true },
  "600001": { city: "Chennai", state: "Tamil Nadu", zonePrefix: "60", metro: true },
  "700001": { city: "Kolkata", state: "West Bengal", zonePrefix: "70", metro: true },
  "500001": { city: "Hyderabad", state: "Telangana", zonePrefix: "50", metro: true },
  "411001": { city: "Pune", state: "Maharashtra", zonePrefix: "41", metro: true },
  "380001": { city: "Ahmedabad", state: "Gujarat", zonePrefix: "38", metro: true },
  "302001": { city: "Jaipur", state: "Rajasthan", zonePrefix: "30" },
  "226001": { city: "Lucknow", state: "Uttar Pradesh", zonePrefix: "22" },
  "160017": { city: "Chandigarh", state: "Chandigarh", zonePrefix: "16" },
  "682001": { city: "Kochi", state: "Kerala", zonePrefix: "68" },
  "751001": { city: "Bhubaneswar", state: "Odisha", zonePrefix: "75" },
  "781001": { city: "Guwahati", state: "Assam", zonePrefix: "78" },
  "190001": { city: "Srinagar", state: "Jammu & Kashmir", zonePrefix: "19" },
  "744101": { city: "Port Blair", state: "Andaman & Nicobar", zonePrefix: "74" },
  "403001": { city: "Panaji", state: "Goa", zonePrefix: "40" },
  "248001": { city: "Dehradun", state: "Uttarakhand", zonePrefix: "24" },
  "800001": { city: "Patna", state: "Bihar", zonePrefix: "80" },
  "462001": { city: "Bhopal", state: "Madhya Pradesh", zonePrefix: "46" },
};

// Remote / special-zone prefixes (NE states, J&K, islands).
const SPECIAL_PREFIXES = ["19", "18", "74", "79", "78", "73"];

export const ZONE_META: Record<
  ShippingZone,
  { label: string; eta: [number, number]; baseRate: number; perKgRate: number }
> = {
  local: { label: "Local", eta: [1, 2], baseRate: 35, perKgRate: 22 },
  regional: { label: "Regional", eta: [2, 3], baseRate: 48, perKgRate: 32 },
  metro: { label: "Metro", eta: [2, 4], baseRate: 55, perKgRate: 38 },
  national: { label: "National", eta: [3, 6], baseRate: 65, perKgRate: 46 },
  special: { label: "Special / Remote", eta: [5, 9], baseRate: 95, perKgRate: 72 },
};

export const SERVICE_META: Record<
  ServiceLevel,
  { label: string; multiplier: number; etaDelta: number }
> = {
  surface: { label: "Surface", multiplier: 1, etaDelta: 0 },
  express: { label: "Express", multiplier: 1.6, etaDelta: -1 },
  same_day: { label: "Same-day", multiplier: 2.8, etaDelta: -2 },
};

const FUEL_SURCHARGE = 0.12;
const GST_RATE = 0.18;
const COD_FLAT = 35;
const COD_PERCENT = 0.015;

export function lookupPincode(pincode: string) {
  return SAMPLE_PINCODES[pincode] ?? null;
}

export function classifyZone(origin: string, destination: string): ShippingZone {
  if (!/^\d{6}$/.test(origin) || !/^\d{6}$/.test(destination)) return "national";

  const oPrefix2 = origin.slice(0, 2);
  const dPrefix2 = destination.slice(0, 2);
  const oPrefix3 = origin.slice(0, 3);
  const dPrefix3 = destination.slice(0, 3);

  if (SPECIAL_PREFIXES.includes(oPrefix2) || SPECIAL_PREFIXES.includes(dPrefix2)) {
    return "special";
  }
  if (oPrefix3 === dPrefix3) return "local";
  if (oPrefix2 === dPrefix2) return "regional";

  const oMeta = SAMPLE_PINCODES[origin];
  const dMeta = SAMPLE_PINCODES[destination];
  if (oMeta?.metro && dMeta?.metro) return "metro";

  return "national";
}

function volumetricWeight(l?: number, w?: number, h?: number) {
  if (!l || !w || !h) return 0;
  // Standard courier divisor 5000 (cm) -> grams
  return Math.round(((l * w * h) / 5000) * 1000);
}

export function calculateRate(req: RateRequest): RateResult {
  const zone = classifyZone(req.origin, req.destination);
  const zoneMeta = ZONE_META[zone];
  const serviceMeta = SERVICE_META[req.service];

  const volGrams = volumetricWeight(req.length, req.width, req.height);
  const chargeable = Math.max(req.weightGrams, volGrams);
  const chargeableKg = Math.max(0.5, chargeable / 1000);

  const base = zoneMeta.baseRate * serviceMeta.multiplier;
  const weightCharge = Math.ceil(chargeableKg * 2) / 2 * zoneMeta.perKgRate * serviceMeta.multiplier;
  const fuel = (base + weightCharge) * FUEL_SURCHARGE;

  const breakdown: RateBreakdownLine[] = [
    { label: "Base charge", amount: round2(base), hint: `${zoneMeta.label} · ${serviceMeta.label}` },
    {
      label: "Weight charge",
      amount: round2(weightCharge),
      hint: `${chargeableKg.toFixed(2)} kg chargeable`,
    },
    { label: "Fuel surcharge", amount: round2(fuel), hint: "12%" },
  ];

  if (req.cod) {
    const codFee = COD_FLAT + (req.declaredValue ?? 0) * COD_PERCENT;
    breakdown.push({ label: "COD handling", amount: round2(codFee), hint: "₹35 + 1.5%" });
  }

  const subtotal = breakdown.reduce((sum, line) => sum + line.amount, 0);
  const gst = subtotal * GST_RATE;
  breakdown.push({ label: "GST", amount: round2(gst), hint: "18%" });

  const total = round2(subtotal + gst);

  const etaLow = Math.max(1, zoneMeta.eta[0] + serviceMeta.etaDelta);
  const etaHigh = Math.max(etaLow, zoneMeta.eta[1] + serviceMeta.etaDelta);

  const oMeta = SAMPLE_PINCODES[req.origin];
  const dMeta = SAMPLE_PINCODES[req.destination];

  return {
    zone,
    zoneLabel: zoneMeta.label,
    service: req.service,
    serviceLabel: serviceMeta.label,
    chargeableWeightGrams: chargeable,
    volumetricWeightGrams: volGrams,
    etaDays: [etaLow, etaHigh],
    currency: "INR",
    breakdown,
    total,
    origin: {
      pincode: req.origin,
      city: oMeta?.city ?? "Unknown",
      state: oMeta?.state ?? "—",
    },
    destination: {
      pincode: req.destination,
      city: dMeta?.city ?? "Unknown",
      state: dMeta?.state ?? "—",
    },
    serviceable: /^\d{6}$/.test(req.origin) && /^\d{6}$/.test(req.destination),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** The example request/response shown in docs and the playground "as code" view. */
export function sampleRequestBody(req: RateRequest) {
  return {
    origin: req.origin,
    destination: req.destination,
    weight: req.weightGrams,
    dimensions:
      req.length && req.width && req.height
        ? { length: req.length, width: req.width, height: req.height, unit: "cm" }
        : undefined,
    service: req.service,
    cod: req.cod,
    declared_value: req.declaredValue,
  };
}
