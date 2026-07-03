import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions, companyIdField } from "./_base.js";

/** shippingRules — conditional overrides (free shipping, surcharges, blocks). */
const shippingRuleSchema = new Schema(
  {
    companyId: companyIdField,
    name: { type: String, required: true },
    description: String,
    priority: { type: Number, default: 100 },
    enabled: { type: Boolean, default: true },
    stopOnMatch: { type: Boolean, default: false },
    // { match: "all"|"any", predicates: [{ field, op, value }] }
    conditions: { type: Schema.Types.Mixed, default: () => ({ match: "all", predicates: [] }) },
    // [{ kind: "free_shipping"|"add_surcharge"|..., ...params }]
    actions: { type: [Schema.Types.Mixed], default: [] },
    appliesToServiceLevels: { type: [String], default: [] },
    effectiveFrom: { type: Date, default: null },
    effectiveTo: { type: Date, default: null },
    status: { type: String, enum: ["draft", "active", "archived"], default: "draft" },
    version: { type: Number, default: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isDeleted: { type: Boolean, default: false },
  },
  baseOptions,
);

shippingRuleSchema.index({ companyId: 1, enabled: 1, priority: 1 });
shippingRuleSchema.index({ companyId: 1, status: 1 });

export type ShippingRule = InferSchemaType<typeof shippingRuleSchema>;
export const ShippingRuleModel = model("ShippingRule", shippingRuleSchema);
