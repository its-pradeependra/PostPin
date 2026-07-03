import { type InferSchemaType, Schema, model } from "mongoose";
import { companyIdField } from "./_base.js";

/** apiLogs — append-only request audit for /v1. High volume; TTL 90 days. */
const apiLogSchema = new Schema(
  {
    companyId: companyIdField,
    apiKeyId: { type: Schema.Types.ObjectId, ref: "ApiKey", required: true },
    keyPrefix: String,
    requestId: String,
    method: String,
    endpoint: String,
    statusCode: Number,
    outcome: { type: String, enum: ["success", "client_error", "server_error", "blocked"] },
    latencyMs: Number,
    mode: { type: String, enum: ["live", "test"] },
    billable: { type: Boolean, default: true },
    ip: String,
    userAgent: String,
    origin: String,
    region: String,
    errorCode: String,
    cacheHit: { type: Boolean, default: false },
    detail: { type: Schema.Types.Mixed }, // shipment context: { origin, destination, zone }
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false, versionKey: false },
);

apiLogSchema.index({ companyId: 1, createdAt: -1 });
apiLogSchema.index({ companyId: 1, endpoint: 1, createdAt: -1 });
apiLogSchema.index({ apiKeyId: 1, createdAt: -1 });
apiLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7_776_000 }); // 90d TTL

export type ApiLog = InferSchemaType<typeof apiLogSchema>;
export const ApiLogModel = model("ApiLog", apiLogSchema);
