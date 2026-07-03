import { type InferSchemaType, Schema, model } from "mongoose";

/** auditLogs — append-only compliance trail (companyId nullable; TTL 730d). */
const auditLogSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorType: { type: String, enum: ["user", "admin", "system", "api"], default: "system" },
    actorEmail: { type: String, default: null },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    action: { type: String, required: true }, // verb.noun, e.g. "auth.login"
    category: {
      type: String,
      enum: ["billing", "security", "config", "data", "support", "pincode", "auth"],
      default: "config",
    },
    // `kind` (not `type`) to avoid the Mongoose reserved-key pitfall.
    resource: {
      kind: { type: String, default: null },
      id: { type: String, default: null },
      name: { type: String, default: null },
    },
    outcome: { type: String, enum: ["success", "failure", "denied"], default: "success" },
    severity: { type: String, enum: ["info", "notice", "warning", "critical"], default: "info" },
    changes: { type: [Schema.Types.Mixed], default: [] },
    ip: String,
    userAgent: String,
    requestId: String,
    sessionId: String,
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: false, versionKey: false },
);

auditLogSchema.index({ at: -1 });
auditLogSchema.index({ companyId: 1, at: -1 });
auditLogSchema.index({ actorId: 1, at: -1 });
auditLogSchema.index({ action: 1, at: -1 });
auditLogSchema.index({ category: 1, severity: 1, at: -1 });
auditLogSchema.index({ at: 1 }, { expireAfterSeconds: 63_072_000 }); // 730d

export type AuditLog = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = model("AuditLog", auditLogSchema);
