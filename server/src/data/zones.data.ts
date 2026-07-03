/** Seed zones — canonical origin→destination bands (checked in priority order). */
export interface SeedZone {
  code: string;
  name: string;
  tier: number;
  description: string;
  resolution: { priority: number };
  slaDays: { min: number; max: number };
  isSpecial: boolean;
}

export const SEED_ZONES: SeedZone[] = [
  { code: "ne_jk", name: "Special / Remote", tier: 5, description: "NE states, J&K, islands", resolution: { priority: 10 }, slaDays: { min: 5, max: 9 }, isSpecial: true },
  { code: "within_city", name: "Local", tier: 1, description: "Same city (first-3 pincode match)", resolution: { priority: 20 }, slaDays: { min: 1, max: 2 }, isSpecial: false },
  { code: "within_state", name: "Regional", tier: 2, description: "Same state (first-2 pincode match)", resolution: { priority: 30 }, slaDays: { min: 2, max: 3 }, isSpecial: false },
  { code: "metro", name: "Metro", tier: 3, description: "Between metro cities", resolution: { priority: 40 }, slaDays: { min: 2, max: 4 }, isSpecial: false },
  { code: "roi", name: "National", tier: 4, description: "Rest of India", resolution: { priority: 50 }, slaDays: { min: 3, max: 6 }, isSpecial: false },
];

/** Engine pricing per zone (paise). Base + per-kg, used by the M2 rate engine. */
export const ZONE_PRICING: Record<string, { baseChargePaise: number; perKgPaise: number; etaDays: [number, number] }> = {
  within_city: { baseChargePaise: 3_500, perKgPaise: 2_200, etaDays: [1, 2] },
  within_state: { baseChargePaise: 4_800, perKgPaise: 3_200, etaDays: [2, 3] },
  metro: { baseChargePaise: 5_500, perKgPaise: 3_800, etaDays: [2, 4] },
  roi: { baseChargePaise: 6_500, perKgPaise: 4_600, etaDays: [3, 6] },
  ne_jk: { baseChargePaise: 9_500, perKgPaise: 7_200, etaDays: [5, 9] },
};
