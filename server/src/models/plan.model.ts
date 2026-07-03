import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions } from "./_base.js";

/** plans — global subscription tiers. All money in integer paise. */
const planSchema = new Schema(
  {
    code: { type: String, required: true }, // free | starter | growth | scale | enterprise
    version: { type: Number, default: 1 },
    name: { type: String, required: true },
    description: String,
    priceMonthlyPaise: { type: Number, default: 0 },
    priceYearlyPaise: { type: Number, default: 0 },
    includedCalls: { type: Number, default: 0 }, // -1 = unlimited
    overagePer1kPaise: { type: Number, default: null }, // paise per 1,000 calls; null = hard block
    rateLimit: {
      rpm: { type: Number, default: 30 },
      rpd: { type: Number, default: 0 },
      burst: { type: Number, default: 10 },
    },
    features: { type: Schema.Types.Mixed, default: {} },
    maxApiKeys: { type: Number, default: 1 },
    maxTeamMembers: { type: Number, default: 1 },
    trialDays: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isPublic: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    schemaVersion: { type: Number, default: 1 },
  },
  baseOptions,
);

planSchema.index({ code: 1, version: 1 }, { unique: true });
planSchema.index({ isActive: 1, isPublic: 1, sortOrder: 1 });

export type Plan = InferSchemaType<typeof planSchema>;
export const PlanModel = model("Plan", planSchema);
