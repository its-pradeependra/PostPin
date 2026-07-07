import type { FastifyInstance } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { getContext } from "@/context/request-context.js";
import { AppError } from "@/lib/errors.js";
import { authenticate } from "@/middleware/authenticate.js";
import { requirePermission } from "@/middleware/authorize.js";
import { requireTenant } from "@/middleware/tenant.js";
import { PlanModel, SubscriptionModel } from "@/models/index.js";
import { billableCallsSince } from "@/services/usage.service.js";

export async function subscriptionRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get("/", { preHandler: [authenticate, requireTenant, requirePermission("usage:read")] }, async () => {
    const { companyId } = getContext();
    const sub = await SubscriptionModel.findOne({ companyId, status: "active" }).lean();
    if (!sub) throw AppError.notFound("No active subscription");
    const plan = await PlanModel.findById(sub.planId).lean();
    const included = plan?.includedCalls ?? sub.usage?.includedCalls ?? 0;
    const used = await billableCallsSince(sub.currentPeriodStart);

    return {
      data: {
        plan: {
          code: sub.planCode,
          name: plan?.name ?? sub.planCode,
          included_calls: included,
          rate_limit_rpm: plan?.rateLimit?.rpm ?? null,
          price_monthly_paise: plan?.priceMonthlyPaise ?? 0,
          max_api_keys: plan?.maxApiKeys ?? null,
        },
        status: sub.status,
        interval: sub.interval,
        current_period_start: sub.currentPeriodStart,
        current_period_end: sub.currentPeriodEnd,
        usage: {
          calls_used: used,
          included_calls: included,
          remaining: included === -1 ? -1 : Math.max(0, included - used),
        },
      },
    };
  });
}
