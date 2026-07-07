import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions, companyIdField } from "./_base.js";

/** subscriptions — one active billing contract per tenant. */
const subscriptionSchema = new Schema(
  {
    companyId: companyIdField,
    planId: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
    planCode: { type: String, required: true },
    status: {
      type: String,
      enum: ["trialing", "active", "past_due", "canceled", "expired"],
      default: "active",
    },
    interval: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
    priceSnapshotPaise: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    currentPeriodStart: { type: Date, default: Date.now },
    currentPeriodEnd: { type: Date, required: true },
    trialEndsAt: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    canceledAt: { type: Date, default: null },
    couponId: { type: Schema.Types.ObjectId, ref: "Coupon", default: null },
    discountAppliedPaise: { type: Number, default: 0 },
    usage: {
      callsUsed: { type: Number, default: 0 },
      includedCalls: { type: Number, default: 0 },
      periodKey: { type: String, default: null }, // YYYY-MM
    },
    paymentProvider: { type: String, enum: ["razorpay", "manual"], default: "manual" },
    providerSubscriptionId: { type: String, default: null },
    dunning: {
      attempts: { type: Number, default: 0 },
      lastAttemptAt: { type: Date, default: null },
      nextAttemptAt: { type: Date, default: null },
    },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  baseOptions,
);

subscriptionSchema.index({ companyId: 1, status: 1 });
// At most one ACTIVE subscription per tenant.
subscriptionSchema.index(
  { companyId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

export type Subscription = InferSchemaType<typeof subscriptionSchema>;
export const SubscriptionModel = model("Subscription", subscriptionSchema);
