import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions, companyIdField } from "./_base.js";

/** A weight slab within a rate card. Money in paise, weights in grams. */
const slabSchema = new Schema(
  {
    zoneCode: { type: String, required: true },
    fromWeightG: { type: Number, required: true },
    toWeightG: { type: Number, default: null },
    baseChargePaise: { type: Number, required: true },
    stepWeightG: { type: Number, default: 500 },
    stepChargePaise: { type: Number, default: 0 },
  },
  { _id: false },
);

/** rateCards — per-tenant pricing matrix. */
const rateCardSchema = new Schema(
  {
    companyId: companyIdField,
    name: { type: String, required: true },
    code: { type: String, required: true },
    serviceLevel: {
      type: String,
      enum: ["surface", "air", "express", "same_day"],
      default: "surface",
    },
    currency: { type: String, default: "INR" },
    weightUnit: { type: String, enum: ["kg", "g"], default: "g" },
    volumetricDivisor: { type: Number, default: 5000 },
    slabs: { type: [slabSchema], default: [] },
    // `mode` (not `type`) to avoid Mongoose's reserved-key pitfall.
    codCharge: {
      mode: { type: String, enum: ["flat", "percent", "max"], default: "max" },
      flatPaise: { type: Number, default: 0 },
      percentBps: { type: Number, default: 0 },
      minPaise: { type: Number, default: 0 },
    },
    fuelSurcharge: {
      enabled: { type: Boolean, default: false },
      percentBps: { type: Number, default: 0 },
    },
    remoteAreaSurcharge: {
      enabled: { type: Boolean, default: false },
      flatPaise: { type: Number, default: 0 },
      perKgPaise: { type: Number, default: 0 },
    },
    gst: {
      enabled: { type: Boolean, default: true },
      percentBps: { type: Number, default: 1800 },
      mode: { type: String, enum: ["inclusive", "exclusive"], default: "exclusive" },
    },
    minChargePaise: { type: Number, default: 0 },
    roundingMode: { type: String, enum: ["none", "nearest", "ceil"], default: "nearest" },
    effectiveFrom: { type: Date, default: Date.now },
    effectiveTo: { type: Date, default: null },
    isDefault: { type: Boolean, default: false },
    status: { type: String, enum: ["draft", "active", "archived"], default: "draft" },
    version: { type: Number, default: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isDeleted: { type: Boolean, default: false },
  },
  baseOptions,
);

rateCardSchema.index({ companyId: 1, code: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
rateCardSchema.index({ companyId: 1, serviceLevel: 1, isDefault: 1 });
rateCardSchema.index({ companyId: 1, status: 1, effectiveFrom: -1 });

export type RateCard = InferSchemaType<typeof rateCardSchema>;
export const RateCardModel = model("RateCard", rateCardSchema);
