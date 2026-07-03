import type { FastifyInstance, FastifyRequest } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "@/middleware/authenticate.js";
import { requirePermission } from "@/middleware/authorize.js";
import { requireTenant } from "@/middleware/tenant.js";
import { verifyWebhookSignature } from "@/lib/razorpay.js";
import * as billing from "@/services/billing.service.js";

export async function billingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const write = [authenticate, requireTenant, requirePermission("billing:write")];

  app.get("/plans", { preHandler: [authenticate, requireTenant] }, async () => billing.listPlans());

  app.get(
    "/invoices",
    { preHandler: [authenticate, requireTenant, requirePermission("invoice:read")] },
    async () => billing.listInvoices(),
  );

  app.post(
    "/checkout",
    {
      preHandler: write,
      schema: { body: z.object({ plan_code: z.string().min(1), interval: z.enum(["monthly", "yearly"]), coupon_code: z.string().max(40).optional() }) },
    },
    async (req) => billing.createCheckout({ planCode: req.body.plan_code, interval: req.body.interval, couponCode: req.body.coupon_code }),
  );

  app.post(
    "/coupon/validate",
    { preHandler: write, schema: { body: z.object({ code: z.string().min(1).max(40), plan_code: z.string().min(1), interval: z.enum(["monthly", "yearly"]) }) } },
    async (req) => billing.validateCoupon({ code: req.body.code, planCode: req.body.plan_code, interval: req.body.interval }),
  );

  app.get(
    "/invoices/:id/pdf",
    { preHandler: [authenticate, requireTenant, requirePermission("invoice:read")], schema: { params: z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/) }) } },
    async (req, reply) => {
      const { filename, pdf } = await billing.invoicePdf(req.params.id);
      return reply.type("application/pdf").header("content-disposition", `attachment; filename="${filename}"`).send(pdf);
    },
  );

  // Platform (invoice:refund) — refund a paid invoice cross-tenant.
  app.post(
    "/invoices/:id/refund",
    { preHandler: [authenticate, requirePermission("invoice:refund")], schema: { params: z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/) }) } },
    async (req) => billing.refundInvoice(req.params.id),
  );

  app.post(
    "/verify",
    {
      preHandler: write,
      schema: {
        body: z.object({
          razorpay_order_id: z.string().min(1),
          razorpay_payment_id: z.string().min(1),
          razorpay_signature: z.string().min(1),
        }),
      },
    },
    async (req) => billing.verifyPayment(req.body),
  );

  // Dev/test only — simulate a successful Razorpay payment (service blocks this in production).
  app.post(
    "/dev-complete",
    { preHandler: write, schema: { body: z.object({ order_id: z.string().min(1) }) } },
    async (req) => billing.devCompleteCheckout(req.body.order_id),
  );

  app.post("/cancel", { preHandler: write }, async () => billing.cancelSubscription());

  // Razorpay webhook — public, signature-verified. Source of truth for payment capture.
  app.post("/webhook", async (req, reply) => {
    const sig = String(req.headers["x-razorpay-signature"] ?? "");
    const raw = (req as FastifyRequest & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    if (!verifyWebhookSignature(raw, sig)) {
      return reply.code(400).send({ error: "invalid_signature" });
    }
    const result = await billing.handleWebhookEvent(req.body as { event: string; payload: Record<string, unknown> });
    return reply.send({ ok: true, ...result });
  });
}
