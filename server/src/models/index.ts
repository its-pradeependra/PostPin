/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Model } from "mongoose";
import { logger } from "@/lib/logger.js";

// Re-export every model + inferred type.
export * from "./company.model.js";
export * from "./permission.model.js";
export * from "./role.model.js";
export * from "./user.model.js";
export * from "./session.model.js";
export * from "./plan.model.js";
export * from "./subscription.model.js";
export * from "./invoice.model.js";
export * from "./coupon.model.js";
export * from "./apiKey.model.js";
export * from "./apiLog.model.js";
export * from "./settings.model.js";
export * from "./rateCard.model.js";
export * from "./shippingRule.model.js";
export * from "./zone.model.js";
export * from "./pincode.model.js";
export * from "./pincodeSyncLog.model.js";
export * from "./ticket.model.js";
export * from "./ticketReply.model.js";
export * from "./notification.model.js";
export * from "./webhook.model.js";
export * from "./webhookDelivery.model.js";
export * from "./auditLog.model.js";
export * from "./blog.model.js";

import { CompanyModel } from "./company.model.js";
import { PermissionModel } from "./permission.model.js";
import { RoleModel } from "./role.model.js";
import { UserModel } from "./user.model.js";
import { SessionModel } from "./session.model.js";
import { PlanModel } from "./plan.model.js";
import { SubscriptionModel } from "./subscription.model.js";
import { InvoiceModel } from "./invoice.model.js";
import { CouponModel } from "./coupon.model.js";
import { ApiKeyModel } from "./apiKey.model.js";
import { ApiLogModel } from "./apiLog.model.js";
import { SettingsModel } from "./settings.model.js";
import { RateCardModel } from "./rateCard.model.js";
import { ShippingRuleModel } from "./shippingRule.model.js";
import { ZoneModel } from "./zone.model.js";
import { PincodeModel } from "./pincode.model.js";
import { PincodeSyncLogModel } from "./pincodeSyncLog.model.js";
import { TicketModel } from "./ticket.model.js";
import { TicketReplyModel } from "./ticketReply.model.js";
import { NotificationModel } from "./notification.model.js";
import { WebhookModel } from "./webhook.model.js";
import { WebhookDeliveryModel } from "./webhookDelivery.model.js";
import { AuditLogModel } from "./auditLog.model.js";
import { BlogPostModel } from "./blog.model.js";

export const ALL_MODELS: Model<any>[] = [
  CompanyModel,
  PermissionModel,
  RoleModel,
  UserModel,
  SessionModel,
  PlanModel,
  SubscriptionModel,
  InvoiceModel,
  CouponModel,
  ApiKeyModel,
  ApiLogModel,
  SettingsModel,
  RateCardModel,
  ShippingRuleModel,
  ZoneModel,
  PincodeModel,
  PincodeSyncLogModel,
  TicketModel,
  TicketReplyModel,
  NotificationModel,
  WebhookModel,
  WebhookDeliveryModel,
  AuditLogModel,
  BlogPostModel,
];

/** Strictly tenant-scoped models (companyId required + immutable). */
export const SCOPED_MODELS: Model<any>[] = [
  SubscriptionModel,
  InvoiceModel,
  ApiKeyModel,
  ApiLogModel,
  RateCardModel,
  ShippingRuleModel,
  TicketModel,
  TicketReplyModel,
  WebhookModel,
  WebhookDeliveryModel,
];

/**
 * Defense layer 3, enforced in CODE: every strictly-scoped collection MUST have a
 * compound index whose FIRST key is `companyId`. Throws if any is missing.
 */
export function assertScoped(): void {
  const offenders: string[] = [];
  for (const m of SCOPED_MODELS) {
    const indexes = m.schema.indexes() as Array<[Record<string, unknown>, Record<string, unknown>]>;
    const hasLeading = indexes.some(([fields]) => Object.keys(fields)[0] === "companyId");
    if (!hasLeading) offenders.push(m.modelName);
  }
  if (offenders.length > 0) {
    throw new Error(
      `Tenant isolation violation — scoped models missing a companyId-leading index: ${offenders.join(", ")}`,
    );
  }
}

/** Ensure DB indexes exist (best-effort; never blocks boot). */
export async function registerIndexes(): Promise<void> {
  assertScoped();
  await Promise.all(
    ALL_MODELS.map((m) =>
      m
        .createIndexes()
        .catch((err: unknown) =>
          logger.warn({ model: m.modelName, err: (err as Error).message }, "index build failed"),
        ),
    ),
  );
  logger.info({ models: ALL_MODELS.length }, "MongoDB indexes ensured");
}
