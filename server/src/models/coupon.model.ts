import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions } from "./_base.js";

/** coupons — global (companyId null) or tenant-targeted promo codes. */
const couponSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    discountType: { type: String, enum: ["percent", "flat", "free_months"], required: true },
    value: { type: Number, required: true }, // percent basis points | paise | months
    appliesToPlanCodes: { type: [String], default: [] },
    redemptionCount: { type: Number, default: 0 },
    maxRedemptions: { type: Number, default: null },
    validFrom: { type: Date, default: Date.now },
    validUntil: { type: Date, default: null },
    status: { type: String, enum: ["active", "paused", "expired"], default: "active" },
    schemaVersion: { type: Number, default: 1 },
  },
  baseOptions,
);

couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ status: 1, validUntil: 1 });

export type Coupon = InferSchemaType<typeof couponSchema>;
export const CouponModel = model("Coupon", couponSchema);
