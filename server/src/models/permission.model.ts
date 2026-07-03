import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions } from "./_base.js";

/** permissions — global catalog of grantable actions (resource:action). */
const permissionSchema = new Schema(
  {
    key: { type: String, required: true, unique: true }, // e.g. "apikey:create"
    resource: { type: String, required: true },
    action: { type: String, required: true },
    description: String,
    group: String,
    scope: { type: String, enum: ["platform", "tenant"], required: true },
    isDangerous: { type: Boolean, default: false },
    schemaVersion: { type: Number, default: 1 },
  },
  baseOptions,
);

permissionSchema.index({ resource: 1, action: 1 }, { unique: true });
permissionSchema.index({ scope: 1, group: 1 });

export type Permission = InferSchemaType<typeof permissionSchema>;
export const PermissionModel = model("Permission", permissionSchema);
