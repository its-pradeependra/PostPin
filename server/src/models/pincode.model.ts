import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions } from "./_base.js";

/** pincodes — global India Post master (~155k). GeoJSON deferred to the sync milestone. */
const pincodeSchema = new Schema(
  {
    pincode: { type: String, required: true, unique: true },
    officeName: String,
    officeType: String,
    district: String,
    stateCode: String,
    state: String,
    city: String,
    region: String,
    circle: String,
    country: { type: String, default: "India" },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    isMetro: { type: Boolean, default: false },
    isRemote: { type: Boolean, default: false },
    serviceable: {
      prepaid: { type: Boolean, default: true },
      cod: { type: Boolean, default: true },
      pickup: { type: Boolean, default: true },
    },
    defaultZoneHint: String,
    aliases: { type: [String], default: [] },
    source: { type: String, enum: ["india_post", "manual", "import"], default: "manual" },
    status: { type: String, enum: ["active", "removed"], default: "active" },
    lastSyncId: { type: Schema.Types.ObjectId, ref: "PincodeSyncLog", default: null },
    version: { type: Number, default: 1 },
  },
  baseOptions,
);

pincodeSchema.index({ stateCode: 1, district: 1 });
pincodeSchema.index({ status: 1, updatedAt: -1 });
pincodeSchema.index({ isMetro: 1, isRemote: 1 });

export type Pincode = InferSchemaType<typeof pincodeSchema>;
export const PincodeModel = model("Pincode", pincodeSchema);
