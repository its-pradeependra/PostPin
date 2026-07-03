import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions, companyIdField } from "./_base.js";

/** apiKeys — machine credentials for the public /v1 API. Secret stored hashed. */
const apiKeySchema = new Schema(
  {
    companyId: companyIdField,
    name: { type: String, required: true },
    prefix: { type: String, required: true, unique: true }, // pp_live_xxxxx / pp_test_xxxxx
    last4: { type: String, required: true },
    hashedKey: { type: String, required: true, unique: true }, // HMAC-SHA256(full token, pepper)
    lookupId: { type: String, required: true }, // fast O(1) lookup id
    mode: { type: String, enum: ["live", "test"], required: true },
    status: { type: String, enum: ["active", "revoked", "expired"], default: "active" },
    scopes: { type: [String], default: [] },
    allowedDomains: { type: [String], default: [] },
    allowedIps: { type: [String], default: [] },
    rateLimitOverride: {
      rpm: { type: Number, default: null },
      rpd: { type: Number, default: null },
      burst: { type: Number, default: null },
    },
    expiresAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    lastUsedIp: String,
    requestCount: { type: Number, default: 0 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    revokedAt: { type: Date, default: null },
    revokedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    schemaVersion: { type: Number, default: 1 },
  },
  baseOptions,
);

apiKeySchema.index({ lookupId: 1 });
apiKeySchema.index({ companyId: 1, status: 1 });
apiKeySchema.index({ companyId: 1, createdAt: -1 });
apiKeySchema.index({ expiresAt: 1 }, { partialFilterExpression: { expiresAt: { $type: "date" } } });

export type ApiKey = InferSchemaType<typeof apiKeySchema>;
export const ApiKeyModel = model("ApiKey", apiKeySchema);
