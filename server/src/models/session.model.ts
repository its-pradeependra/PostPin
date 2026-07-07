import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions } from "./_base.js";

/** sessions — one row per refresh token; rotation creates a new row in the same family. */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    refreshHash: { type: String, required: true, unique: true }, // sha256 of the raw refresh token
    family: { type: String, required: true }, // rotation family id
    userAgent: String,
    ip: String,
    ipCountry: String,
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBySessionId: { type: Schema.Types.ObjectId, ref: "Session", default: null },
    amr: { type: [String], default: [] },
    // "Remember me": true → the refresh cookie is persistent (survives browser
    // restart up to expiresAt); false → a session cookie (cleared on close).
    // Carried across rotations so refreshes keep the original choice.
    persistent: { type: Boolean, default: true },
  },
  baseOptions,
);

sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ family: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL: Mongo deletes at expiresAt

export type Session = InferSchemaType<typeof sessionSchema>;
export const SessionModel = model("Session", sessionSchema);
