import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions } from "./_base.js";

/** zones — global origin→destination pricing bands. */
const zoneSchema = new Schema(
  {
    code: { type: String, required: true, unique: true }, // within_city, within_state, metro, roi, ne_jk...
    name: { type: String, required: true },
    tier: { type: Number, default: 3 },
    description: String,
    resolution: {
      srcScope: String,
      destScope: String,
      states: { type: [String], default: [] },
      metroPair: { type: Boolean, default: false },
      priority: { type: Number, default: 100 },
    },
    slaDays: {
      min: { type: Number, default: 1 },
      max: { type: Number, default: 5 },
    },
    // Engine pricing (paise). null = fall back to the built-in ZONE_PRICING seed.
    baseChargePaise: { type: Number, default: null },
    perKgPaise: { type: Number, default: null },
    isSpecial: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    metadata: { type: Schema.Types.Mixed },
  },
  baseOptions,
);

zoneSchema.index({ "resolution.priority": 1, isActive: 1 });
zoneSchema.index({ tier: 1 });

export type Zone = InferSchemaType<typeof zoneSchema>;
export const ZoneModel = model("Zone", zoneSchema);
