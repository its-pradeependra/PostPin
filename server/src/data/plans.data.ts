/** Seed plans — adapted from the front-end mock (INR → integer paise). */
export interface SeedPlan {
  code: string;
  name: string;
  description: string;
  priceMonthlyPaise: number;
  priceYearlyPaise: number;
  includedCalls: number; // -1 = unlimited
  overagePer1kPaise: number | null; // paise per 1,000 calls; null = hard block
  rateLimit: { rpm: number; rpd: number; burst: number };
  maxApiKeys: number; // -1 = unlimited
  maxTeamMembers: number; // -1 = unlimited
  trialDays: number;
  isPublic: boolean;
  sortOrder: number;
  features: string[];
}

const burst = (rpm: number) => Math.max(10, Math.ceil(rpm / 6));

export const SEED_PLANS: SeedPlan[] = [
  {
    code: "free",
    name: "Free",
    description: "For trying Postpin out.",
    priceMonthlyPaise: 0,
    priceYearlyPaise: 0,
    includedCalls: 1_000,
    overagePer1kPaise: null, // hard block
    rateLimit: { rpm: 30, rpd: 0, burst: burst(30) },
    maxApiKeys: 1,
    maxTeamMembers: 2,
    trialDays: 0,
    isPublic: true,
    sortOrder: 0,
    features: ["1,000 rate calls / month", "1 API key", "1 allowed domain", "Community support", "Pincode serviceability lookup"],
  },
  {
    code: "starter",
    name: "Starter",
    description: "For early-stage stores.",
    priceMonthlyPaise: 149_900,
    priceYearlyPaise: 124_900,
    includedCalls: 25_000,
    overagePer1kPaise: 900, // ₹9 / 1k
    rateLimit: { rpm: 120, rpd: 0, burst: burst(120) },
    maxApiKeys: 3,
    maxTeamMembers: 3,
    trialDays: 0,
    isPublic: true,
    sortOrder: 1,
    features: ["25,000 rate calls / month", "3 API keys", "5 allowed domains", "Email support", "Webhooks", "Standard rate cards"],
  },
  {
    code: "growth",
    name: "Growth",
    description: "For scaling D2C & marketplaces.",
    priceMonthlyPaise: 499_900,
    priceYearlyPaise: 416_500,
    includedCalls: 250_000,
    overagePer1kPaise: 700, // ₹7 / 1k
    rateLimit: { rpm: 600, rpd: 0, burst: burst(600) },
    maxApiKeys: 10,
    maxTeamMembers: 10,
    trialDays: 0,
    isPublic: true,
    sortOrder: 2,
    features: ["250,000 rate calls / month", "10 API keys", "Unlimited domains + IP allowlist", "Priority support", "Custom rate cards", "Bulk rating API", "99.9% uptime SLA"],
  },
  {
    code: "scale",
    name: "Scale",
    description: "For high-volume logistics.",
    priceMonthlyPaise: 1_499_900,
    priceYearlyPaise: 1_249_900,
    includedCalls: 1_500_000,
    overagePer1kPaise: 500, // ₹5 / 1k
    rateLimit: { rpm: 2_000, rpd: 0, burst: burst(2_000) },
    maxApiKeys: -1,
    maxTeamMembers: 50,
    trialDays: 0,
    isPublic: true,
    sortOrder: 3,
    features: ["1.5M rate calls / month", "Unlimited API keys", "Dedicated rate-card workflows", "24×7 support + Slack channel", "Custom zones", "Sub-50ms p99 SLA"],
  },
  {
    code: "enterprise",
    name: "Enterprise",
    description: "For platforms & ERPs.",
    priceMonthlyPaise: -1, // custom / contact sales
    priceYearlyPaise: -1,
    includedCalls: -1, // unlimited (negotiated)
    overagePer1kPaise: null,
    rateLimit: { rpm: 10_000, rpd: 0, burst: burst(10_000) },
    maxApiKeys: -1,
    maxTeamMembers: -1,
    trialDays: 0,
    isPublic: true,
    sortOrder: 4,
    features: ["Custom volume & pricing", "SSO / SAML + audit export", "Dedicated infrastructure", "White-label dashboard & docs", "Custom SLA + DPA", "Named solutions engineer"],
  },
];

export const DEFAULT_PLAN_CODE = "free";
