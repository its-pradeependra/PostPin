import { apiFetch } from "@/lib/api/client";

export type FeZone = "local" | "regional" | "metro" | "national" | "special";

export interface RateSlabDto {
  upToGrams: number | null;
  price: number; // rupees
}

export interface RateCardRowDto {
  zone: FeZone;
  zoneLabel: string;
  slabs: RateSlabDto[];
  extraPer500g: number;
}

export interface RateCardDto {
  id: string;
  name: string;
  assignedTo: string;
  status: "published" | "draft";
  currency: "INR";
  codFlat: number;
  codPercent: number;
  fuelPercent: number;
  gstPercent: number;
  rows: RateCardRowDto[];
  effectiveFrom: string;
  updatedAt: string;
  editable: boolean;
}

export interface ZoneDto {
  id: FeZone;
  label: string;
  description: string;
  metro: boolean;
  remote: boolean;
  etaDays: [number, number];
  tier: number;
}

export function getRateCards() {
  return apiFetch<{ cards: RateCardDto[]; zones: ZoneDto[] }>("/rate-cards");
}
