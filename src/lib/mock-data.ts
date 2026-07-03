import { seededRandom } from "./utils";
import type {
  AccountUser,
  AdminMember,
  AdminMetric,
  ApiKey,
  AppNotification,
  AuditLogEntry,
  EndpointStat,
  Invoice,
  Plan,
  PincodeRecord,
  Promotion,
  RateCard,
  RecentCall,
  StatusSlice,
  SyncRun,
  Ticket,
  UsagePoint,
  Webhook,
  WebhookDelivery,
  ZoneDef,
} from "./types";

/* ════════════════════════════════════════════════════════════════
   POSTPIN MOCK DATA
   Realistic, India-first sample data powering the whole UI. Stable
   across renders (seeded). Swap these modules for the real services/
   layer to wire the Node.js API — component code stays unchanged.
   ════════════════════════════════════════════════════════════════ */

const NOW = new Date("2026-06-26T10:30:00+05:30").getTime();
const DAY = 86_400_000;
const iso = (offsetDays: number, h = 0) =>
  new Date(NOW - offsetDays * DAY + h * 3_600_000).toISOString();

// ── Current customer / account ────────────────────────────────────
export const currentUser: AccountUser = {
  id: "usr_8fQ2",
  name: "Aarav Sharma",
  email: "aarav@flipmart.in",
  company: "FlipMart Retail Pvt Ltd",
  avatar: "https://api.dicebear.com/9.x/glass/svg?seed=Aarav&backgroundType=gradientLinear",
  plan: "growth",
  status: "active",
  joinedAt: iso(214),
  calls30d: 184_320,
  monthlyQuota: 250_000,
  apiKeys: 3,
  mrr: 4999,
  country: "India",
};

// ── Plans ─────────────────────────────────────────────────────────
export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "For trying Postpin out.",
    priceMonthly: 0,
    priceYearly: 0,
    includedCalls: 1_000,
    overagePer1k: 0,
    rateLimitRpm: 30,
    features: [
      "1,000 rate calls / month",
      "1 API key",
      "1 allowed domain",
      "Community support",
      "Pincode serviceability lookup",
    ],
    badge: "Start here",
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "For early-stage stores.",
    priceMonthly: 1499,
    priceYearly: 1249,
    includedCalls: 25_000,
    overagePer1k: 9,
    rateLimitRpm: 120,
    features: [
      "25,000 rate calls / month",
      "3 API keys",
      "5 allowed domains",
      "Email support",
      "Webhooks",
      "Standard rate cards",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For scaling D2C & marketplaces.",
    priceMonthly: 4999,
    priceYearly: 4165,
    includedCalls: 250_000,
    overagePer1k: 7,
    rateLimitRpm: 600,
    features: [
      "250,000 rate calls / month",
      "10 API keys",
      "Unlimited domains + IP allowlist",
      "Priority support",
      "Custom rate cards",
      "Bulk rating API",
      "99.9% uptime SLA",
    ],
    highlight: true,
    badge: "Most popular",
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "For high-volume logistics.",
    priceMonthly: 14999,
    priceYearly: 12499,
    includedCalls: 1_500_000,
    overagePer1k: 5,
    rateLimitRpm: 2_000,
    features: [
      "1.5M rate calls / month",
      "Unlimited API keys",
      "Dedicated rate-card workflows",
      "24×7 support + Slack channel",
      "Custom zones",
      "Sub-50ms p99 SLA",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For platforms & ERPs.",
    priceMonthly: -1,
    priceYearly: -1,
    includedCalls: -1,
    overagePer1k: 0,
    rateLimitRpm: 10_000,
    features: [
      "Custom volume & pricing",
      "SSO / SAML + audit export",
      "Dedicated infrastructure",
      "White-label dashboard & docs",
      "Custom SLA & DPA",
      "Solutions engineer",
    ],
    badge: "Contact us",
  },
];

export const currentPlan = plans.find((p) => p.id === currentUser.plan)!;

// ── API keys ──────────────────────────────────────────────────────
export const apiKeys: ApiKey[] = [
  {
    id: "key_live_01",
    name: "Production — flipmart.in",
    prefix: "pk_live",
    maskedKey: "pk_live_••••••••••••••••8f3a",
    env: "live",
    status: "active",
    createdAt: iso(180),
    lastUsedAt: iso(0, -2),
    allowedDomains: ["flipmart.in", "www.flipmart.in", "checkout.flipmart.in"],
    requests30d: 162_004,
    createdBy: "Aarav Sharma",
  },
  {
    id: "key_live_02",
    name: "Mobile app — backend",
    prefix: "pk_live",
    maskedKey: "pk_live_••••••••••••••••12c9",
    env: "live",
    status: "active",
    createdAt: iso(96),
    lastUsedAt: iso(0, -6),
    allowedDomains: ["*.flipmart.in"],
    requests30d: 21_540,
    createdBy: "Priya Nair",
  },
  {
    id: "key_test_01",
    name: "Sandbox / staging",
    prefix: "pk_test",
    maskedKey: "pk_test_••••••••••••••••a0b1",
    env: "test",
    status: "active",
    createdAt: iso(60),
    lastUsedAt: iso(3),
    allowedDomains: ["localhost", "staging.flipmart.in"],
    requests30d: 776,
    createdBy: "Aarav Sharma",
  },
  {
    id: "key_live_03",
    name: "Legacy integration (revoked)",
    prefix: "pk_live",
    maskedKey: "pk_live_••••••••••••••••77de",
    env: "live",
    status: "revoked",
    createdAt: iso(320),
    lastUsedAt: iso(45),
    allowedDomains: ["old.flipmart.in"],
    requests30d: 0,
    createdBy: "Aarav Sharma",
  },
];

// ── Usage analytics ───────────────────────────────────────────────
export function usageSeries(days = 30): UsagePoint[] {
  const rand = seededRandom(42);
  const out: UsagePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const base = 5_200 + Math.sin((days - i) / 3) * 1_400 + rand() * 1_800;
    const calls = Math.round(base);
    const failed = Math.round(calls * (0.006 + rand() * 0.01));
    const blocked = Math.round(calls * (0.002 + rand() * 0.004));
    out.push({
      date: iso(i),
      calls,
      success: calls - failed - blocked,
      failed,
      blocked,
      avgLatency: Math.round(28 + rand() * 22),
    });
  }
  return out;
}

export const usageSummary = (() => {
  const s = usageSeries(30);
  const calls = s.reduce((a, b) => a + b.calls, 0);
  const success = s.reduce((a, b) => a + b.success, 0);
  const failed = s.reduce((a, b) => a + b.failed, 0);
  const blocked = s.reduce((a, b) => a + b.blocked, 0);
  const avgLatency = Math.round(s.reduce((a, b) => a + b.avgLatency, 0) / s.length);
  return { calls, success, failed, blocked, avgLatency, successRate: success / calls };
})();

export const endpointStats: EndpointStat[] = [
  { endpoint: "POST /v1/rates/calculate", calls: 168_120, successRate: 0.991, avgLatency: 38 },
  { endpoint: "GET /v1/serviceability/:pin", calls: 41_904, successRate: 0.998, avgLatency: 19 },
  { endpoint: "POST /v1/rates/bulk", calls: 22_460, successRate: 0.983, avgLatency: 92 },
  { endpoint: "GET /v1/pincodes/:code", calls: 12_870, successRate: 0.999, avgLatency: 15 },
  { endpoint: "GET /v1/zones", calls: 3_120, successRate: 1.0, avgLatency: 11 },
];

export const statusBreakdown: StatusSlice[] = [
  { label: "2xx Success", value: 96.4, color: "var(--chart-5)" },
  { label: "4xx Client", value: 2.3, color: "var(--chart-4)" },
  { label: "429 Rate-limited", value: 0.9, color: "var(--chart-2)" },
  { label: "5xx Server", value: 0.4, color: "var(--destructive)" },
];

const ZONES_FOR_CALLS = ["metro", "national", "regional", "local", "special"] as const;
export const recentCalls: RecentCall[] = Array.from({ length: 12 }).map((_, i) => {
  const rand = seededRandom(100 + i);
  const ok = rand() > 0.12;
  const cached = rand() > 0.55;
  return {
    id: `req_${(987654 - i * 37).toString(16)}`,
    endpoint: "/v1/rates/calculate",
    method: "POST",
    status: ok ? 200 : rand() > 0.5 ? 422 : 429,
    latencyMs: Math.round((cached ? 6 : 34) + rand() * 30),
    keyName: i % 3 === 2 ? "Mobile app — backend" : "Production — flipmart.in",
    origin: ["400001", "110001", "560001", "700001"][i % 4],
    destination: ["302001", "781001", "190001", "682001", "500001"][i % 5],
    zone: ZONES_FOR_CALLS[i % ZONES_FOR_CALLS.length],
    cached,
    at: iso(0, -(i * 2 + 1)),
  };
});

// ── Invoices ──────────────────────────────────────────────────────
export const invoices: Invoice[] = Array.from({ length: 8 }).map((_, i) => {
  const issued = iso(i * 30 + 4);
  return {
    id: `inv_${2026 - 0}${(12 - i).toString().padStart(2, "0")}`,
    number: `PP-2026-${(120 - i).toString().padStart(4, "0")}`,
    plan: "Growth (monthly)",
    amount: i === 0 ? 4999 + 1330 : 4999,
    status: i === 0 ? "open" : "paid",
    issuedAt: issued,
    paidAt: i === 0 ? null : iso(i * 30 + 3),
    periodStart: iso(i * 30 + 30),
    periodEnd: iso(i * 30),
  };
});

// ── Support tickets ───────────────────────────────────────────────
export const tickets: Ticket[] = [
  {
    id: "tkt_1042",
    subject: "Rate mismatch for 190001 (Srinagar) shipments",
    category: "pincode-data",
    priority: "high",
    status: "open",
    createdAt: iso(1, -3),
    updatedAt: iso(0, -4),
    requester: { name: "Aarav Sharma", email: "aarav@flipmart.in", company: "FlipMart Retail" },
    assignee: "Meera Krishnan",
    messages: [
      {
        id: "m1",
        author: "Aarav Sharma",
        authorRole: "customer",
        body: "We're getting Special-zone pricing for 190001 but it should be Remote. Can you check the zone mapping for Srinagar pincodes?",
        createdAt: iso(1, -3),
      },
      {
        id: "m2",
        author: "Meera Krishnan",
        authorRole: "agent",
        body: "Thanks Aarav — looking into the J&K zone mapping now. 190001 currently resolves to the Special zone which carries our remote surcharge. I'll confirm the rate-card slab and get back within the hour.",
        createdAt: iso(0, -4),
      },
    ],
  },
  {
    id: "tkt_1038",
    subject: "Increase rate limit on Growth plan",
    category: "billing",
    priority: "medium",
    status: "pending",
    createdAt: iso(4),
    updatedAt: iso(2),
    requester: { name: "Priya Nair", email: "priya@flipmart.in", company: "FlipMart Retail" },
    assignee: "Rohan Mehta",
    messages: [
      {
        id: "m1",
        author: "Priya Nair",
        authorRole: "customer",
        body: "During our sale we hit the 600 RPM limit. Can we temporarily bump it?",
        createdAt: iso(4),
      },
    ],
  },
  {
    id: "tkt_1021",
    subject: "Webhook deliveries failing with 401",
    category: "api",
    priority: "urgent",
    status: "resolved",
    createdAt: iso(9),
    updatedAt: iso(7),
    requester: { name: "Aarav Sharma", email: "aarav@flipmart.in", company: "FlipMart Retail" },
    assignee: "Meera Krishnan",
    messages: [
      {
        id: "m1",
        author: "Aarav Sharma",
        authorRole: "customer",
        body: "All webhook deliveries returning 401 since this morning.",
        createdAt: iso(9),
      },
      {
        id: "m2",
        author: "Meera Krishnan",
        authorRole: "agent",
        body: "Your endpoint was rejecting our signature header. We've documented the verification steps — rotating the secret fixed it on our test. Marking resolved; reopen if it recurs.",
        createdAt: iso(7),
      },
    ],
  },
];

// ── Rate cards ────────────────────────────────────────────────────
const defaultZoneRows = (
  [
    ["local", "Local", [40, 55, 70], 18],
    ["regional", "Regional", [48, 66, 84], 22],
    ["metro", "Metro", [55, 76, 96], 26],
    ["national", "National", [65, 90, 115], 32],
    ["special", "Special / Remote", [95, 130, 165], 48],
  ] as const
).map(([zone, label, p, extra]) => ({
  zone,
  zoneLabel: label,
  slabs: [
    { upToGrams: 500, price: p[0] },
    { upToGrams: 1000, price: p[1] },
    { upToGrams: 2000, price: p[2] },
    { upToGrams: null, price: p[2] },
  ],
  extraPer500g: extra,
}));

export const rateCards: RateCard[] = [
  {
    id: "rc_default",
    name: "Postpin Standard",
    assignedTo: "Default",
    status: "published",
    currency: "INR",
    codFlat: 35,
    codPercent: 1.5,
    fuelPercent: 12,
    gstPercent: 18,
    rows: defaultZoneRows,
    effectiveFrom: iso(214),
    updatedAt: iso(40),
  },
  {
    id: "rc_flipmart",
    name: "FlipMart Negotiated",
    assignedTo: "FlipMart Retail Pvt Ltd",
    status: "published",
    currency: "INR",
    codFlat: 25,
    codPercent: 1.2,
    fuelPercent: 10,
    gstPercent: 18,
    rows: defaultZoneRows.map((r) => ({
      ...r,
      slabs: r.slabs.map((s) => ({ ...s, price: Math.round(s.price * 0.88) })),
    })),
    effectiveFrom: iso(120),
    updatedAt: iso(12),
  },
  {
    id: "rc_premium",
    name: "Premium Express (draft)",
    assignedTo: "—",
    status: "draft",
    currency: "INR",
    codFlat: 40,
    codPercent: 2,
    fuelPercent: 14,
    gstPercent: 18,
    rows: defaultZoneRows,
    effectiveFrom: iso(-7),
    updatedAt: iso(1),
  },
];

// ── Zones ─────────────────────────────────────────────────────────
export const zones: ZoneDef[] = [
  { id: "local", label: "Local", description: "Same city / first-3 pincode match", states: ["Within city"], metro: false, remote: false, etaDays: [1, 2], pincodeCount: 18540 },
  { id: "regional", label: "Regional", description: "Same state / first-2 pincode match", states: ["Same state"], metro: false, remote: false, etaDays: [2, 3], pincodeCount: 41230 },
  { id: "metro", label: "Metro", description: "Between the 8 metro cities", states: ["Delhi", "Maharashtra", "Karnataka", "Tamil Nadu", "West Bengal", "Telangana"], metro: true, remote: false, etaDays: [2, 4], pincodeCount: 9120 },
  { id: "national", label: "National", description: "Rest of India", states: ["All other states"], metro: false, remote: false, etaDays: [3, 6], pincodeCount: 78460 },
  { id: "special", label: "Special / Remote", description: "NE states, J&K, islands", states: ["Jammu & Kashmir", "Assam", "Manipur", "Andaman & Nicobar"], metro: false, remote: true, etaDays: [5, 9], pincodeCount: 7890 },
];

// ── Webhooks ──────────────────────────────────────────────────────
export const webhooks: Webhook[] = [
  {
    id: "wh_01",
    url: "https://flipmart.in/api/postpin/webhook",
    events: ["rate.calculated", "subscription.updated", "invoice.paid"],
    status: "active",
    secret: "whsec_••••••••••••3f9c",
    createdAt: iso(150),
    lastDeliveryAt: iso(0, -1),
    successRate: 0.997,
  },
  {
    id: "wh_02",
    url: "https://ops.flipmart.in/hooks/sync",
    events: ["sync.completed", "sync.failed"],
    status: "active",
    secret: "whsec_••••••••••••71ab",
    createdAt: iso(70),
    lastDeliveryAt: iso(1),
    successRate: 1.0,
  },
];

export const webhookDeliveries: WebhookDelivery[] = Array.from({ length: 10 }).map((_, i) => {
  const rand = seededRandom(300 + i);
  const ok = rand() > 0.1;
  return {
    id: `whd_${(5000 - i).toString(16)}`,
    webhookId: i % 2 === 0 ? "wh_01" : "wh_02",
    event: (["rate.calculated", "subscription.updated", "sync.completed", "invoice.paid"] as const)[i % 4],
    status: ok ? 200 : 500,
    ok,
    durationMs: Math.round(80 + rand() * 240),
    attempt: ok ? 1 : 2,
    at: iso(0, -(i * 3 + 2)),
  };
});

// ── Notifications ─────────────────────────────────────────────────
export const notifications: AppNotification[] = [
  { id: "n1", kind: "usage", title: "Approaching quota", body: "You've used 74% of your 250,000 monthly rate calls.", read: false, at: iso(0, -3) },
  { id: "n2", kind: "sync", title: "Pincode sync completed", body: "Nightly India Post sync added 12 and updated 318 pincodes.", read: false, at: iso(0, -10) },
  { id: "n3", kind: "key", title: "New API key created", body: "Key “Mobile app — backend” was created by Priya Nair.", read: true, at: iso(2) },
  { id: "n4", kind: "billing", title: "Invoice PP-2026-0120 is ready", body: "Your Growth plan invoice for this period is available.", read: true, at: iso(4) },
  { id: "n5", kind: "ticket", title: "Support replied to #tkt_1042", body: "Meera Krishnan replied to your ticket about Srinagar zones.", read: true, at: iso(0, -4) },
];

/* ════════════════════════════════════════════════════════════════
   ADMIN MOCK DATA
   ════════════════════════════════════════════════════════════════ */

// ── Admin KPIs ────────────────────────────────────────────────────
export const adminMetrics: AdminMetric[] = [
  { label: "MRR", value: "₹18.4L", deltaPct: 12.4, icon: "dollar", spark: [12, 13, 13, 14, 15, 16, 18] },
  { label: "Active tenants", value: "1,284", deltaPct: 6.1, icon: "company", spark: [1100, 1150, 1180, 1205, 1240, 1265, 1284] },
  { label: "API calls (24h)", value: "3.92M", deltaPct: 9.7, icon: "activity", spark: [3.1, 3.3, 3.4, 3.5, 3.7, 3.8, 3.92] },
  { label: "Pincodes synced", value: "1,57,238", deltaPct: 0.2, icon: "pin", spark: [156, 156, 157, 157, 157, 157, 157] },
  { label: "Open tickets", value: "37", deltaPct: -8.0, icon: "ticket", spark: [52, 48, 45, 44, 41, 39, 37] },
  { label: "Sync health", value: "99.6%", deltaPct: 0.1, icon: "sync", spark: [99, 99, 100, 99, 100, 99, 100] },
];

export const adminRevenueSeries = (() => {
  const rand = seededRandom(7);
  return Array.from({ length: 12 }).map((_, i) => ({
    month: ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"][i],
    mrr: Math.round(900000 + i * 95000 + rand() * 120000),
    newMrr: Math.round(80000 + rand() * 60000),
  }));
})();

// ── Tenant directory ──────────────────────────────────────────────
const COMPANIES = [
  ["FlipMart Retail Pvt Ltd", "growth", "active", 250000, 184320, 4999],
  ["Kirana Connect", "starter", "active", 25000, 19440, 1499],
  ["Lehenga House", "starter", "trialing", 25000, 4120, 0],
  ["BharatBox Logistics", "scale", "active", 1500000, 1184000, 14999],
  ["Sadak ERP", "enterprise", "active", -1, 4920000, 89000],
  ["NorthEast Crafts", "free", "active", 1000, 870, 0],
  ["MumbaiMeds", "growth", "active", 250000, 96400, 4999],
  ["DeccanDirect", "starter", "suspended", 25000, 0, 1499],
  ["Chai & Co", "free", "active", 1000, 410, 0],
  ["Velocity Couriers", "scale", "active", 1500000, 902300, 14999],
  ["Gully Grocery", "growth", "active", 250000, 142900, 4999],
  ["Patna Prints", "starter", "invited", 25000, 0, 0],
] as const;

export const adminUsers: AccountUser[] = COMPANIES.map((c, i) => ({
  id: `usr_${(1000 + i).toString(16)}`,
  name: ["Aarav Sharma", "Neha Gupta", "Vikram Singh", "Sana Khan", "Arjun Rao", "Lila Devi", "Karan Patel", "Ritu Joshi", "Imran Ali", "Deepa Menon", "Sahil Verma", "Anaya Das"][i],
  email: `owner@${c[0].toLowerCase().replace(/[^a-z]+/g, "")}.in`,
  company: c[0],
  avatar: `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(c[0])}&backgroundType=gradientLinear`,
  plan: c[1] as AccountUser["plan"],
  status: c[2] as AccountUser["status"],
  joinedAt: iso(30 + i * 17),
  calls30d: c[4] as number,
  monthlyQuota: c[3] as number,
  apiKeys: 1 + (i % 4),
  mrr: c[5] as number,
  country: "India",
}));

// ── Sub-admins ────────────────────────────────────────────────────
export const adminMembers: AdminMember[] = [
  { id: "adm_1", name: "Rohan Mehta", email: "rohan@postpin.dev", avatar: "https://api.dicebear.com/9.x/glass/svg?seed=Rohan", role: "superadmin", status: "active", lastActiveAt: iso(0, -1), twoFactor: true },
  { id: "adm_2", name: "Meera Krishnan", email: "meera@postpin.dev", avatar: "https://api.dicebear.com/9.x/glass/svg?seed=Meera", role: "support", status: "active", lastActiveAt: iso(0, -3), twoFactor: true },
  { id: "adm_3", name: "Dev Patel", email: "dev@postpin.dev", avatar: "https://api.dicebear.com/9.x/glass/svg?seed=Dev", role: "billing", status: "active", lastActiveAt: iso(1), twoFactor: false },
  { id: "adm_4", name: "Sara Wilson", email: "sara@postpin.dev", avatar: "https://api.dicebear.com/9.x/glass/svg?seed=Sara", role: "readonly", status: "invited", lastActiveAt: iso(5), twoFactor: false },
];

// ── Promotions / coupons ──────────────────────────────────────────
export const promotions: Promotion[] = [
  { id: "cp_1", code: "LAUNCH50", type: "percent", value: 50, status: "active", redemptions: 218, maxRedemptions: 500, appliesTo: "all", startsAt: iso(60), expiresAt: iso(-30) },
  { id: "cp_2", code: "GROWTH3FREE", type: "trial", value: 90, status: "active", redemptions: 64, maxRedemptions: null, appliesTo: ["growth"], startsAt: iso(40), expiresAt: iso(-90) },
  { id: "cp_3", code: "DIWALI2025", type: "flat", value: 1000, status: "expired", redemptions: 1402, maxRedemptions: 2000, appliesTo: "all", startsAt: iso(240), expiresAt: iso(210) },
  { id: "cp_4", code: "SCALEUP", type: "percent", value: 20, status: "scheduled", redemptions: 0, maxRedemptions: 300, appliesTo: ["scale", "growth"], startsAt: iso(-14), expiresAt: iso(-60) },
];

/* ════════════════════════════════════════════════════════════════
   PINCODE MANAGEMENT (the flagship module)
   ════════════════════════════════════════════════════════════════ */

export const pincodeStats = {
  total: 157_238,
  lastSyncAt: iso(0, -10),
  newToday: 12,
  updatedToday: 318,
  deletedToday: 3,
  failedToday: 0,
  status: "synced" as const,
  nextSyncAt: iso(-1, 14.5), // tomorrow 00:30
  autoSync: true,
};

export const syncSettings = {
  endpoint: "https://api.postalpincode.in/pincode",
  syncTime: "00:30",
  retryCount: 3,
  timeoutMs: 30_000,
  autoSync: true,
  notificationEmail: "ops@postpin.dev",
  webhookUrl: "https://ops.postpin.dev/hooks/pincode-sync",
};

export const syncRuns: SyncRun[] = Array.from({ length: 10 }).map((_, i) => {
  const rand = seededRandom(500 + i);
  const failed = i === 3 ? 1 : 0;
  return {
    id: `sync_${(20260626 - i).toString()}`,
    startedAt: iso(i, 0.5),
    finishedAt: iso(i, 0.5 + 0.05),
    status: failed ? "failed" : "synced",
    recordsScanned: 157_000 + Math.round(rand() * 400),
    recordsAdded: Math.round(rand() * 30),
    recordsUpdated: Math.round(200 + rand() * 300),
    durationMs: Math.round(168_000 + rand() * 40_000),
    trigger: i === 0 ? "scheduled" : i === 5 ? "manual" : "scheduled",
  };
});

export const pincodes: PincodeRecord[] = [
  ["110001", "Connaught Place", "Central Delhi", "Delhi", "Delhi", "national", true],
  ["400001", "Mumbai GPO", "Mumbai", "Maharashtra", "Western", "metro", true],
  ["560001", "Bengaluru GPO", "Bengaluru Urban", "Karnataka", "Karnataka", "metro", true],
  ["600001", "Chennai GPO", "Chennai", "Tamil Nadu", "Tamil Nadu", "metro", true],
  ["700001", "Kolkata GPO", "Kolkata", "West Bengal", "West Bengal", "metro", true],
  ["500001", "Hyderabad GPO", "Hyderabad", "Telangana", "Telangana", "metro", true],
  ["302001", "Jaipur GPO", "Jaipur", "Rajasthan", "Rajasthan", "national", false],
  ["781001", "Guwahati GPO", "Kamrup", "Assam", "North East", "special", false],
  ["190001", "Srinagar GPO", "Srinagar", "Jammu & Kashmir", "J&K", "special", false],
  ["744101", "Port Blair", "South Andaman", "Andaman & Nicobar", "Islands", "special", false],
  ["682001", "Cochin", "Ernakulam", "Kerala", "Kerala", "national", false],
  ["226001", "Lucknow GPO", "Lucknow", "Uttar Pradesh", "Uttar Pradesh", "national", false],
].map(([pincode, officeName, district, state, circle, zone, metro]) => ({
  pincode: pincode as string,
  officeName: officeName as string,
  district: district as string,
  state: state as string,
  region: circle as string,
  circle: circle as string,
  zone: zone as PincodeRecord["zone"],
  metro: metro as boolean,
  source: "India Post API",
  updatedAt: iso(0, -10),
}));

// ── Audit logs ────────────────────────────────────────────────────
export const auditLogs: AuditLogEntry[] = [
  { id: "al_1", actor: "Rohan Mehta", actorRole: "superadmin", action: "pincode.sync.started", target: "sync_20260626", ip: "103.21.58.12", at: iso(0, -10), severity: "info" },
  { id: "al_2", actor: "system", actorRole: "superadmin", action: "pincode.sync.completed", target: "sync_20260626 (+12 / ~318)", ip: "—", at: iso(0, -10.05), severity: "info" },
  { id: "al_3", actor: "Dev Patel", actorRole: "billing", action: "plan.updated", target: "Growth → ₹4,999", ip: "49.36.220.7", at: iso(0, -22), severity: "warning" },
  { id: "al_4", actor: "Meera Krishnan", actorRole: "support", action: "user.impersonated", target: "FlipMart Retail Pvt Ltd", ip: "103.21.58.40", at: iso(1), severity: "warning" },
  { id: "al_5", actor: "Rohan Mehta", actorRole: "superadmin", action: "ratecard.changed", target: "FlipMart Negotiated", ip: "103.21.58.12", at: iso(1, -5), severity: "warning" },
  { id: "al_6", actor: "system", actorRole: "superadmin", action: "pincode.sync.failed", target: "sync_20260623 (timeout)", ip: "—", at: iso(3, 0.5), severity: "critical" },
  { id: "al_7", actor: "Aarav Sharma", actorRole: "customer", action: "apikey.created", target: "Mobile app — backend", ip: "157.45.10.2", at: iso(96), severity: "info" },
  { id: "al_8", actor: "Rohan Mehta", actorRole: "superadmin", action: "coupon.created", target: "LAUNCH50", ip: "103.21.58.12", at: iso(60), severity: "info" },
];

// ── Admin ticket queue (re-uses customer tickets + a few more) ────
export const adminTickets: Ticket[] = [
  ...tickets,
  {
    id: "tkt_1051",
    subject: "API returning 500 on bulk rating",
    category: "api",
    priority: "urgent",
    status: "open",
    createdAt: iso(0, -6),
    updatedAt: iso(0, -5),
    requester: { name: "Karan Patel", email: "karan@gullygrocery.in", company: "Gully Grocery" },
    assignee: null,
    messages: [
      { id: "m1", author: "Karan Patel", authorRole: "customer", body: "Bulk rating endpoint intermittently 500s for batches over 200 shipments.", createdAt: iso(0, -6) },
    ],
  },
  {
    id: "tkt_1049",
    subject: "Need GST-exclusive pricing in response",
    category: "feature-request",
    priority: "low",
    status: "pending",
    createdAt: iso(2),
    updatedAt: iso(1),
    requester: { name: "Deepa Menon", email: "deepa@velocity.in", company: "Velocity Couriers" },
    assignee: "Rohan Mehta",
    messages: [
      { id: "m1", author: "Deepa Menon", authorRole: "customer", body: "Can the response include a gst_exclusive_total field?", createdAt: iso(2) },
    ],
  },
];
