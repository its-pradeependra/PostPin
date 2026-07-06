import { getContext } from "@/context/request-context.js";
import { randomToken } from "@/lib/crypto.js";
import { AppError } from "@/lib/errors.js";
import { CompanyModel, RateCardModel } from "@/models/index.js";
import { scopedRepo } from "@/tenancy/scoped-repo.js";
import { writeAudit } from "@/services/audit.service.js";
import { SEED_ZONES, ZONE_PRICING } from "@/data/zones.data.js";

/** The five zones as the customer-facing UI knows them. */
export type FeZone = "local" | "regional" | "metro" | "national" | "special";

// Backend engine zone-code → customer-facing zone + label.
const ZONE_MAP: Record<string, { id: FeZone; label: string }> = {
  within_city: { id: "local", label: "Local" },
  within_state: { id: "regional", label: "Regional" },
  metro: { id: "metro", label: "Metro" },
  roi: { id: "national", label: "National" },
  ne_jk: { id: "special", label: "Special / Remote" },
};
const DISPLAY_ORDER = ["within_city", "within_state", "metro", "roi", "ne_jk"];

// Engine surcharge/tax defaults — fallback only; live values come from the
// DB-backed engine defaults so admin edits reflect here too.
const SURCHARGES = { codFlat: 35, codPercent: 1.5, fuelPercent: 12, gstPercent: 18 };

async function liveSurcharges(): Promise<typeof SURCHARGES> {
  try {
    const { getEngineDefaults } = await import("@/services/rate-engine.service.js");
    const d = await getEngineDefaults();
    return {
      codFlat: Math.round(d.codFlatPaise) / 100,
      codPercent: d.codPercentBps / 100,
      fuelPercent: d.fuelBps / 100,
      gstPercent: d.gstBps / 100,
    };
  } catch {
    return SURCHARGES;
  }
}

const rupees = (paise: number) => Math.round(paise) / 100;

/** Surface freight (base + per-kg × billable kg) in paise for a weight bucket. */
function freightPaise(base: number, perKg: number, billableKg: number): number {
  return base + Math.round(billableKg * perKg);
}

/** Rows for the synthesized Standard card — exactly the pricing the engine bills. */
function standardRows() {
  return DISPLAY_ORDER.map((code) => {
    const p = ZONE_PRICING[code]!;
    const m = ZONE_MAP[code]!;
    return {
      zone: m.id,
      zoneLabel: m.label,
      slabs: [
        { upToGrams: 500, price: rupees(freightPaise(p.baseChargePaise, p.perKgPaise, 0.5)) },
        { upToGrams: 1000, price: rupees(freightPaise(p.baseChargePaise, p.perKgPaise, 1.0)) },
        { upToGrams: 2000, price: rupees(freightPaise(p.baseChargePaise, p.perKgPaise, 2.0)) },
      ],
      extraPer500g: rupees(Math.round(0.5 * p.perKgPaise)),
    };
  });
}

async function standardCard(effectiveFrom: string) {
  return {
    id: "standard",
    name: "Standard rate card",
    assignedTo: "Default — all shipments",
    status: "published" as const,
    currency: "INR" as const,
    ...(await liveSurcharges()),
    rows: standardRows(),
    effectiveFrom,
    updatedAt: effectiveFrom,
    editable: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function customCardDto(doc: any) {
  interface Slab { zoneCode?: string; fromWeightG?: number; baseChargePaise?: number; stepChargePaise?: number }
  const allSlabs: Slab[] = (doc.slabs ?? []) as Slab[];
  const rows = DISPLAY_ORDER.map((code) => {
    const m = ZONE_MAP[code]!;
    const zoneSlabs = allSlabs
      .filter((s) => s.zoneCode === code)
      .sort((a, b) => (a.fromWeightG ?? 0) - (b.fromWeightG ?? 0));
    const priceAt = (i: number) => (zoneSlabs[i] ? rupees(zoneSlabs[i]!.baseChargePaise ?? 0) : 0);
    return {
      zone: m.id,
      zoneLabel: m.label,
      slabs: [
        { upToGrams: 500, price: priceAt(0) },
        { upToGrams: 1000, price: priceAt(1) },
        { upToGrams: 2000, price: priceAt(2) },
      ],
      extraPer500g: zoneSlabs[0] ? rupees(zoneSlabs[0].stepChargePaise ?? 0) : 0,
    };
  });
  return {
    id: String(doc._id),
    name: doc.name,
    assignedTo: "Your account",
    status: doc.status === "active" ? ("published" as const) : ("draft" as const),
    currency: (doc.currency ?? "INR") as "INR",
    codFlat: rupees(doc.codCharge?.flatPaise ?? 0),
    codPercent: (doc.codCharge?.percentBps ?? 0) / 100,
    fuelPercent: (doc.fuelSurcharge?.percentBps ?? 0) / 100,
    gstPercent: (doc.gst?.percentBps ?? 1800) / 100,
    rows,
    effectiveFrom: doc.effectiveFrom ?? doc.createdAt,
    updatedAt: doc.updatedAt ?? doc.createdAt,
    editable: true,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nativeDto(doc: any) {
  return {
    id: String(doc._id),
    name: doc.name,
    code: doc.code,
    serviceLevel: doc.serviceLevel,
    status: doc.status,
    slabs: doc.slabs ?? [],
    currency: doc.currency ?? "INR",
    effective_from: doc.effectiveFrom ?? doc.createdAt,
    created_at: doc.createdAt,
  };
}

function zoneDtos() {
  return DISPLAY_ORDER.map((code) => {
    const seed = SEED_ZONES.find((z) => z.code === code)!;
    const m = ZONE_MAP[code]!;
    const p = ZONE_PRICING[code]!;
    return {
      id: m.id,
      label: m.label,
      description: seed.description,
      metro: code === "metro",
      remote: seed.isSpecial,
      etaDays: p.etaDays,
      tier: seed.tier,
    };
  });
}

/** The customer read surface: the Standard card + any custom cards + the zone map. */
export async function listRateCards() {
  const { companyId } = getContext();
  const company = (await CompanyModel.findById(companyId).lean()) as { createdAt?: Date } | null;
  const created = company?.createdAt ?? new Date();
  const effectiveFrom = new Date(created).toISOString();
  const custom = await scopedRepo(RateCardModel).find({ isDeleted: false }).sort({ createdAt: -1 }).lean();
  return {
    cards: [await standardCard(effectiveFrom), ...custom.map(customCardDto)],
    zones: zoneDtos(),
  };
}

interface SlabInput {
  zoneCode: string;
  fromWeightG: number;
  toWeightG?: number | null;
  baseChargePaise: number;
  stepWeightG?: number;
  stepChargePaise?: number;
}
interface RateCardInput {
  name: string;
  serviceLevel?: "surface" | "air" | "express" | "same_day";
  status?: "draft" | "active" | "archived";
  slabs?: SlabInput[];
}

function slugCode(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "card";
  return `${base}-${randomToken(3)}`;
}

export async function getRateCard(id: string) {
  if (id === "standard") throw AppError.notFound("The Standard card is system-managed");
  const doc = await scopedRepo(RateCardModel).findById(id).lean();
  if (!doc) throw AppError.notFound("Rate card not found");
  return { card: nativeDto(doc) };
}

export async function createRateCard(input: RateCardInput) {
  const ctx = getContext();
  const doc = await scopedRepo(RateCardModel).create({
    name: input.name,
    code: slugCode(input.name),
    serviceLevel: input.serviceLevel ?? "surface",
    status: input.status ?? "draft",
    slabs: input.slabs ?? [],
    createdBy: ctx.userId,
  });
  await writeAudit({ action: "ratecard.created", category: "config", resource: { kind: "rateCard", id: String(doc._id), name: input.name } });
  return { card: nativeDto(doc) };
}

export async function updateRateCard(id: string, patch: Partial<RateCardInput>) {
  if (id === "standard") throw AppError.badRequest("The Standard card cannot be edited");
  const existing = await scopedRepo(RateCardModel).findById(id).lean();
  if (!existing) throw AppError.notFound("Rate card not found");
  // The ASSIGNED billing card is platform-managed: a tenant must never be able
  // to rewrite the prices they are actually charged. Drafts stay editable.
  if (existing.isDefault) {
    throw AppError.forbidden("This card is assigned by Postpin and can only be changed by our team — contact support", "card_platform_managed");
  }
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.serviceLevel !== undefined) set.serviceLevel = patch.serviceLevel;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.slabs !== undefined) set.slabs = patch.slabs;
  const res = await scopedRepo(RateCardModel).findByIdAndUpdate(id, { $set: set });
  if (!res) throw AppError.notFound("Rate card not found");
  await writeAudit({ action: "ratecard.updated", category: "config", resource: { kind: "rateCard", id } });
  return { card: nativeDto(res) };
}

export async function deleteRateCard(id: string) {
  if (id === "standard") throw AppError.badRequest("The Standard card cannot be deleted");
  const existing = await scopedRepo(RateCardModel).findById(id).lean();
  if (!existing) throw AppError.notFound("Rate card not found");
  if (existing.isDefault) {
    throw AppError.forbidden("This card is assigned by Postpin and can only be changed by our team — contact support", "card_platform_managed");
  }
  const res = await scopedRepo(RateCardModel).findByIdAndUpdate(id, { $set: { isDeleted: true, status: "archived" } });
  if (!res) throw AppError.notFound("Rate card not found");
  await writeAudit({ action: "ratecard.deleted", category: "config", severity: "warning", resource: { kind: "rateCard", id, name: res.name } });
  return { ok: true };
}
