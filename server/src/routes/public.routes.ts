import type { FastifyInstance, FastifyRequest } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError } from "@/lib/errors.js";
import { PincodeModel, PlanModel } from "@/models/index.js";
import { calculateRate, resolvePincode, type ServiceLevel } from "@/services/rate-engine.service.js";
import { publicStats, publicStatus } from "@/services/public-stats.service.js";
import { publicBlogSitemap, publicGetBlogPost, publicListBlogPosts } from "@/services/blog.service.js";

const PIN = z.string().regex(/^\d{6}$/);

const rateBody = z.object({
  origin: PIN,
  destination: PIN,
  weight: z.number().positive().max(100_000), // grams
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  service: z.enum(["surface", "air", "express", "same_day"]).default("surface"),
  cod: z.boolean().optional(),
  declared_value: z.number().nonnegative().optional(), // rupees
});

function meta(req: FastifyRequest, engineMs?: number) {
  return { request_id: String(req.id), api_version: "v1", cached: false, ...(engineMs != null ? { engine_ms: engineMs } : {}) };
}

export async function publicRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const rl = (max: number) => ({ rateLimit: { max, timeWindow: "1 minute" } });

  // Marketing contact/sales form → email the platform team + audit trail.
  app.post(
    "/contact",
    {
      schema: {
        body: z.object({
          name: z.string().min(2).max(120),
          email: z.string().email().max(160),
          company: z.string().max(160).optional(),
          topic: z.string().max(80).optional(),
          message: z.string().min(10).max(5000),
        }),
      },
      config: rl(5),
    },
    async (req) => {
      const { sendMail } = await import("@/services/email.service.js");
      const { writeAudit } = await import("@/services/audit.service.js");
      const { getNotificationConfig } = await import("@/services/platform-alerts.service.js");
      const { env } = await import("@/config/env.js");
      const b = req.body;

      // Deliver to the configured ops inbox(es); fall back to the seed admin.
      let recipients: string[] = [];
      try {
        const cfg = await getNotificationConfig();
        if (cfg.email.enabled && cfg.email.recipients.length > 0) recipients = cfg.email.recipients;
      } catch {
        /* fall through to seed admin */
      }
      if (recipients.length === 0) recipients = [env.SEED_ADMIN_EMAIL];

      const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
      const subject = `[Postpin contact] ${b.topic ?? "New enquiry"} — ${b.name}`;
      const text = `From: ${b.name} <${b.email}>${b.company ? `\nCompany: ${b.company}` : ""}\n\n${b.message}`;
      await Promise.all(
        recipients.map((to) =>
          sendMail({
            to,
            subject,
            text,
            html: `<p><strong>${esc(b.name)}</strong> &lt;${esc(b.email)}&gt;${b.company ? ` · ${esc(b.company)}` : ""}</p><p>${esc(b.message).replace(/\n/g, "<br/>")}</p>`,
          }),
        ),
      );
      await writeAudit({
        action: "contact.submitted",
        category: "support",
        actorEmail: b.email,
        resource: { kind: "contact", name: b.name },
        metadata: { topic: b.topic ?? null, company: b.company ?? null },
      });
      return { data: { received: true }, meta: meta(req) };
    },
  );

  app.post("/rates/calculate", { schema: { body: rateBody }, config: rl(30) }, async (req) => {
    const b = req.body;
    const start = process.hrtime.bigint();
    const result = await calculateRate({
      origin: b.origin,
      destination: b.destination,
      weightGrams: b.weight,
      length: b.length,
      width: b.width,
      height: b.height,
      service: b.service as ServiceLevel,
      cod: b.cod,
      declaredValuePaise: b.declared_value != null ? Math.round(b.declared_value * 100) : undefined,
    });
    const engineMs = Number(process.hrtime.bigint() - start) / 1e6;
    return { data: result, meta: meta(req, Math.round(engineMs * 100) / 100) };
  });

  app.get("/serviceability/:pin", { schema: { params: z.object({ pin: PIN }) }, config: rl(60) }, async (req) => {
    const m = await resolvePincode(req.params.pin);
    return {
      data: { pincode: req.params.pin, serviceable: m?.serviceable ?? false, found: Boolean(m), city: m?.city ?? null, state: m?.state ?? null },
      meta: meta(req),
    };
  });

  app.get("/pincodes/:code", { schema: { params: z.object({ code: PIN }) }, config: rl(60) }, async (req) => {
    const doc = await PincodeModel.findOne({ pincode: req.params.code, status: "active" }).lean();
    if (!doc) throw AppError.notFound("Pincode not found");
    return {
      data: {
        pincode: doc.pincode,
        city: doc.city ?? doc.district ?? null,
        state: doc.state ?? null,
        state_code: doc.stateCode ?? null,
        is_metro: doc.isMetro,
        is_remote: doc.isRemote,
        serviceable: doc.serviceable,
      },
      meta: meta(req),
    };
  });

  app.get("/plans", { config: rl(60) }, async (req) => {
    const plans = await PlanModel.find({ isActive: true, isPublic: true }).sort({ sortOrder: 1 }).lean();
    return {
      data: plans.map((p) => ({
        code: p.code,
        name: p.name,
        description: p.description,
        price_monthly_paise: p.priceMonthlyPaise,
        price_yearly_paise: p.priceYearlyPaise,
        included_calls: p.includedCalls,
        rate_limit: p.rateLimit,
        max_api_keys: p.maxApiKeys,
        max_team_members: p.maxTeamMembers,
        features: p.features,
        sort_order: p.sortOrder,
      })),
      meta: meta(req),
    };
  });

  // Published blog posts (marketing site). List is paginated; detail by slug.
  app.get(
    "/blog",
    {
      schema: {
        querystring: z.object({
          tag: z.string().max(40).optional(),
          limit: z.coerce.number().int().min(1).max(50).default(12),
          offset: z.coerce.number().int().min(0).default(0),
        }),
      },
      config: rl(60),
    },
    async (req) => {
      const { posts, total } = await publicListBlogPosts(req.query);
      return { data: posts, meta: { ...meta(req), total } };
    },
  );

  app.get(
    "/blog/sitemap",
    { config: rl(30) },
    async (req) => ({ data: await publicBlogSitemap(), meta: meta(req) }),
  );

  app.get(
    "/blog/:slug",
    { schema: { params: z.object({ slug: z.string().min(1).max(96).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) }) }, config: rl(60) },
    async (req) => ({ data: await publicGetBlogPost(req.params.slug), meta: meta(req) }),
  );

  // Live platform status (public status page). Real component health + 90-day
  // uptime derived from request logs.
  app.get("/status", { config: rl(30) }, async (req) => ({ data: await publicStatus(), meta: meta(req) }));

  // Real platform stats for the marketing pages.
  app.get("/stats", { config: rl(30) }, async (req) => ({ data: await publicStats(), meta: meta(req) }));
}
