import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions } from "./_base.js";

/** companies — the tenant ROOT entity (not itself companyId-scoped). */
const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: {
      type: String,
      enum: ["pending", "active", "suspended", "closed"],
      default: "pending",
    },
    billingEmail: { type: String, lowercase: true, trim: true },
    gstin: { type: String, trim: true, uppercase: true },
    pan: { type: String, trim: true, uppercase: true },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: "IN" },
    },
    defaultPickupPincode: String,
    currency: { type: String, default: "INR" },
    currentSubscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", default: null },
    quotaWarningPct: { type: Number, default: 80 },
    featureFlags: { type: Schema.Types.Mixed, default: {} },
    onboardingStep: {
      type: String,
      enum: ["signup", "verified", "key_created", "first_call", "done"],
      default: "signup",
    },
    metadata: { type: Schema.Types.Mixed },
    schemaVersion: { type: Number, default: 1 },
    deletedAt: { type: Date, default: null },
  },
  baseOptions,
);

companySchema.index({ status: 1, createdAt: -1 });
companySchema.index({ ownerUserId: 1 });
companySchema.index({ gstin: 1 }, { unique: true, partialFilterExpression: { gstin: { $type: "string" } } });

export type Company = InferSchemaType<typeof companySchema>;
export const CompanyModel = model("Company", companySchema);
