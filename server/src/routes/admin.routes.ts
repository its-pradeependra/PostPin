import type { FastifyInstance } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getContext } from "@/context/request-context.js";
import { authenticate } from "@/middleware/authenticate.js";
import { requirePermission } from "@/middleware/authorize.js";
import * as admin from "@/services/admin.service.js";
import * as tickets from "@/services/ticket.service.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid id");
const ticketNumber = z.object({ number: z.string().regex(/^PP-\d{4}-\d{6}$/) });

/** Platform admin routes — cross-tenant, gated on PLATFORM permissions (no requireTenant). */
export async function adminRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const guard = (...perms: string[]) => [authenticate, requirePermission(...perms)];

  // ── Overview + usage ──────────────────────────────────────────────────────
  app.get("/overview", { preHandler: guard("tenant:read") }, async () => admin.overview());

  app.get(
    "/usage-report",
    { preHandler: guard("tenant:read"), schema: { querystring: z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }) } },
    async (req) => admin.usageReport(req.query.days),
  );

  // ── Tenant directory ──────────────────────────────────────────────────────
  app.get(
    "/tenants",
    {
      preHandler: guard("tenant:read"),
      schema: {
        querystring: z.object({
          q: z.string().max(100).optional(),
          plan: z.string().max(40).optional(),
          status: z.enum(["pending", "active", "suspended", "closed"]).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(12),
          offset: z.coerce.number().int().min(0).default(0),
        }),
      },
    },
    async (req) => admin.listTenants(req.query),
  );

  app.get(
    "/tenants/:id",
    { preHandler: guard("tenant.read"), schema: { params: z.object({ id: objectId }) } },
    async (req) => admin.tenantDetail(req.params.id),
  );

  app.post(
    "/tenants/:id/suspend",
    { preHandler: guard("tenant:suspend"), schema: { params: z.object({ id: objectId }) } },
    async (req) => admin.setTenantStatus(req.params.id, "suspend"),
  );

  app.post(
    "/tenants/:id/activate",
    { preHandler: guard("tenant:suspend"), schema: { params: z.object({ id: objectId }) } },
    async (req) => admin.setTenantStatus(req.params.id, "activate"),
  );

  // ── Audit logs ────────────────────────────────────────────────────────────
  app.get(
    "/audit-logs",
    {
      preHandler: guard("audit:read"),
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
          category: z.enum(["billing", "security", "config", "data", "support", "pincode", "auth"]).optional(),
          severity: z.enum(["info", "notice", "warning", "critical"]).optional(),
          q: z.string().max(100).optional(),
        }),
      },
    },
    async (req) => admin.listAuditLogs(req.query),
  );

  // ── Platform staff (assignee dropdowns) ───────────────────────────────────
  app.get("/staff", { preHandler: guard("ticket:write", "admin:write") }, async () => admin.listStaff());

  // ── Plans CRUD ────────────────────────────────────────────────────────────
  app.get("/plans", { preHandler: guard("tenant:read", "plan:write") }, async () => admin.adminListPlans());

  const planPatch = z.object({
    name: z.string().min(2).max(60).optional(),
    description: z.string().max(200).optional(),
    price_monthly: z.number().min(0).optional(),
    price_yearly: z.number().min(0).optional(),
    included_calls: z.number().int().min(-1).optional(),
    overage_per_1k: z.number().min(0).nullable().optional(),
    rate_limit_rpm: z.number().int().min(1).optional(),
    max_api_keys: z.number().int().min(-1).optional(),
    max_team_members: z.number().int().min(-1).optional(),
    is_active: z.boolean().optional(),
    is_public: z.boolean().optional(),
    features: z.array(z.string().max(120)).max(20).optional(),
  });
  app.patch(
    "/plans/:code",
    { preHandler: guard("plan:write"), schema: { params: z.object({ code: z.string().min(2).max(40) }), body: planPatch } },
    async (req) => admin.adminUpdatePlan(req.params.code, req.body),
  );
  app.post(
    "/plans",
    {
      preHandler: guard("plan:write"),
      schema: { body: planPatch.extend({ code: z.string().min(2).max(32), sort_order: z.number().int().min(0).max(999).optional() }) },
    },
    async (req, reply) => reply.code(201).send(await admin.adminCreatePlan(req.body)),
  );

  // ── Coupons CRUD ──────────────────────────────────────────────────────────
  app.get("/coupons", { preHandler: guard("coupon:write") }, async () => admin.adminListCoupons());

  app.post(
    "/coupons",
    {
      preHandler: guard("coupon:write"),
      schema: {
        body: z.object({
          code: z.string().min(3).max(24).regex(/^[A-Za-z0-9_-]+$/),
          discount_type: z.enum(["percent", "flat", "free_months"]),
          value: z.number().positive(),
          applies_to_plan_codes: z.array(z.string()).max(10).optional(),
          max_redemptions: z.number().int().min(1).nullable().optional(),
          valid_until: z.string().datetime().nullable().optional(),
        }),
      },
    },
    async (req, reply) => reply.code(201).send(await admin.adminCreateCoupon(req.body)),
  );

  app.patch(
    "/coupons/:id",
    {
      preHandler: guard("coupon:write"),
      schema: {
        params: z.object({ id: objectId }),
        body: z.object({
          status: z.enum(["active", "paused"]).optional(),
          max_redemptions: z.number().int().min(1).nullable().optional(),
          valid_until: z.string().datetime().nullable().optional(),
        }),
      },
    },
    async (req) => admin.adminUpdateCoupon(req.params.id, req.body),
  );

  // ── Platform billing ──────────────────────────────────────────────────────
  app.get("/billing/summary", { preHandler: guard("tenant:read") }, async () => admin.adminBillingSummary());

  app.get(
    "/billing/invoices",
    {
      preHandler: guard("tenant:read"),
      schema: {
        querystring: z.object({
          status: z.enum(["draft", "open", "paid", "void", "past_due", "refunded"]).optional(),
          q: z.string().max(100).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(25),
          offset: z.coerce.number().int().min(0).default(0),
        }),
      },
    },
    async (req) => admin.adminListInvoices(req.query),
  );

  // ── Pincode master (M6c) ──────────────────────────────────────────────────
  app.get("/pincodes/stats", { preHandler: guard("pincode:config", "pincode:sync") }, async () => admin.pincodeStats());

  app.get(
    "/pincodes/search",
    { preHandler: guard("pincode:config", "pincode:sync"), schema: { querystring: z.object({ q: z.string().min(2).max(60), limit: z.coerce.number().int().min(1).max(50).default(20) }) } },
    async (req) => admin.searchPincodes(req.query.q, req.query.limit),
  );

  app.post(
    "/pincodes/import",
    { preHandler: guard("pincode:sync"), schema: { body: z.object({ csv: z.string().min(10).max(5_000_000) }) } },
    async (req) => admin.importPincodesCsv(req.body.csv),
  );

  // Durable sync status — the UI polls this to disable the trigger and reflect
  // progress until the current run completes or fails.
  app.get("/pincodes/sync/status", { preHandler: guard("pincode:config", "pincode:sync") }, async () => {
    const { getSyncStatus } = await import("@/services/pincode-sync.service.js");
    return getSyncStatus();
  });

  // Manual trigger of the LIVE data.gov.in sync. Fire-and-forget (the run takes
  // ~1–2 min); progress lands in pincodeSyncLogs which the UI polls. Single-flight:
  // 409 while a run is already in progress so a super admin can't double-trigger.
  app.post("/pincodes/sync", { preHandler: guard("pincode:sync") }, async (req, reply) => {
    const { runLiveSync, getSyncStatus } = await import("@/services/pincode-sync.service.js");
    const { env: cfg } = await import("@/config/env.js");
    if (!cfg.DATA_GOV_IN_API_KEY) {
      return reply.code(409).send({ error: { code: "sync_not_configured", message: "DATA_GOV_IN_API_KEY is not configured" } });
    }
    const status = await getSyncStatus();
    if (status.running) {
      return reply.code(409).send({ error: { code: "sync_in_progress", message: "A sync is already running — wait for it to finish" } });
    }
    const ctx = getContext();
    void runLiveSync("manual", ctx.userId).catch(() => {
      /* failure is recorded in the sync log + audit by runLiveSync */
    });
    return reply.code(202).send({ started: true });
  });

  app.get(
    "/pincodes/sync-logs",
    { preHandler: guard("pincode:config", "pincode:sync"), schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) }) } },
    async (req) => admin.listSyncLogs(req.query.limit),
  );

  app.get("/pincodes/sync-settings", { preHandler: guard("pincode:config") }, async () => admin.getSyncSettings());
  app.patch(
    "/pincodes/sync-settings",
    { preHandler: guard("pincode:config"), schema: { body: z.record(z.unknown()) } },
    async (req) => admin.updateSyncSettings(req.body as Record<string, unknown>),
  );

  // ── Zones (M6c) ───────────────────────────────────────────────────────────
  app.get("/zones", { preHandler: guard("pincode:config", "tenant:read") }, async () => admin.adminListZones());
  app.patch(
    "/zones/:code",
    {
      preHandler: guard("pincode:config"),
      schema: {
        params: z.object({ code: z.string().min(2).max(40) }),
        body: z.object({
          name: z.string().min(2).max(60).optional(),
          description: z.string().max(200).optional(),
          tier: z.number().int().min(1).max(9).optional(),
          priority: z.number().int().min(1).max(999).optional(),
          sla_min: z.number().int().min(0).max(60).optional(),
          sla_max: z.number().int().min(0).max(90).optional(),
          base_charge: z.number().min(0).max(100000).optional(),
          per_kg: z.number().min(0).max(100000).optional(),
          is_special: z.boolean().optional(),
          is_active: z.boolean().optional(),
        }),
      },
    },
    async (req) => admin.adminUpdateZone(req.params.code, req.body),
  );

  // ── API-key audit (M6c) ───────────────────────────────────────────────────
  app.get(
    "/api-keys",
    {
      preHandler: guard("apikey:revoke.any"),
      schema: {
        querystring: z.object({
          q: z.string().max(80).optional(),
          status: z.enum(["active", "revoked", "expired"]).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(25),
          offset: z.coerce.number().int().min(0).default(0),
        }),
      },
    },
    async (req) => admin.adminListApiKeys(req.query),
  );
  app.post(
    "/api-keys/:id/revoke",
    { preHandler: guard("apikey:revoke.any"), schema: { params: z.object({ id: objectId }) } },
    async (req) => admin.adminForceRevokeKey(req.params.id),
  );

  // ── Platform team (M6c) ───────────────────────────────────────────────────
  app.get("/team", { preHandler: guard("admin:write") }, async () => admin.listStaffFull());
  app.patch(
    "/team/:id/role",
    { preHandler: guard("admin:write"), schema: { params: z.object({ id: objectId }), body: z.object({ role: z.string().min(2).max(40) }) } },
    async (req) => admin.updateStaffRole(req.params.id, req.body.role),
  );

  // ── Platform settings (M6c) ───────────────────────────────────────────────
  app.get("/settings", { preHandler: guard("settings:write") }, async () => admin.listPlatformSettings());
  app.patch(
    "/settings/:key",
    { preHandler: guard("settings:write"), schema: { params: z.object({ key: z.string().min(2).max(60) }), body: z.record(z.unknown()) } },
    async (req) => admin.updatePlatformSetting(req.params.key, req.body as Record<string, unknown>),
  );

  // ── Rate-cards overview (M6c, read-only) ──────────────────────────────────
  app.get("/rate-cards", { preHandler: guard("tenant:read") }, async () => admin.adminRateCardsOverview());

  // ── Support queue (cross-tenant) ──────────────────────────────────────────
  app.get(
    "/tickets",
    {
      preHandler: guard("ticket:write"),
      schema: {
        querystring: z.object({
          status: z.enum(["open", "pending", "on_hold", "resolved", "closed"]).optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
          q: z.string().max(120).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(100),
        }),
      },
    },
    async (req) => ({ tickets: await tickets.adminListTickets(req.query) }),
  );

  app.get("/tickets/:number", { preHandler: guard("ticket:write"), schema: { params: ticketNumber } }, async (req) => ({
    ticket: await tickets.adminGetTicket(req.params.number),
  }));

  app.post(
    "/tickets/:number/replies",
    {
      preHandler: guard("ticket:write"),
      schema: { params: ticketNumber, body: z.object({ body: z.string().min(1).max(5000), is_internal: z.boolean().default(false) }) },
    },
    async (req, reply) =>
      reply.code(201).send(await tickets.adminReply(req.params.number, { body: req.body.body, isInternal: req.body.is_internal })),
  );

  app.patch(
    "/tickets/:number",
    {
      preHandler: guard("ticket:write"),
      schema: {
        params: ticketNumber,
        body: z.object({
          status: z.enum(["open", "pending", "on_hold", "resolved", "closed"]).optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
          assignee_id: z.union([objectId, z.null()]).optional(),
        }),
      },
    },
    async (req) => ({
      ticket: await tickets.adminUpdateTicket(req.params.number, {
        status: req.body.status,
        priority: req.body.priority,
        assigneeId: req.body.assignee_id,
      }),
    }),
  );
}
