import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions } from "./_base.js";

/** roles — bundles of permissions. companyId null = platform/system role. */
const roleSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    key: { type: String, required: true }, // machine key, e.g. "owner", "super_admin"
    name: { type: String, required: true },
    description: String,
    permissionIds: [{ type: Schema.Types.ObjectId, ref: "Permission" }],
    isSystem: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false },
    scope: { type: String, enum: ["platform", "tenant"], required: true },
    schemaVersion: { type: Number, default: 1 },
  },
  baseOptions,
);

roleSchema.index({ companyId: 1, key: 1 }, { unique: true });
roleSchema.index({ scope: 1, isSystem: 1 });
roleSchema.index({ permissionIds: 1 });

export type Role = InferSchemaType<typeof roleSchema>;
export const RoleModel = model("Role", roleSchema);
