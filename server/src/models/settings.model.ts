import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions } from "./_base.js";

/** settings — operator/tenant key-value config. companyId null = platform. */
const settingsSchema = new Schema(
  {
    scope: { type: String, enum: ["platform", "tenant"], required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    key: { type: String, required: true },
    value: { type: Schema.Types.Mixed },
    description: String,
    isSecret: { type: Boolean, default: false },
    editableBy: { type: String, enum: ["super_admin", "tenant_owner"], default: "super_admin" },
    version: { type: Number, default: 1 },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  baseOptions,
);

settingsSchema.index({ scope: 1, companyId: 1, key: 1 }, { unique: true });

export type Settings = InferSchemaType<typeof settingsSchema>;
export const SettingsModel = model("Settings", settingsSchema);
