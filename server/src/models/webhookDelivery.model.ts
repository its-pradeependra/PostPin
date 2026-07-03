import { type InferSchemaType, Schema, model } from "mongoose";
import { companyIdField } from "./_base.js";

/** webhookDeliveries — per-attempt delivery records (TTL 30d). */
const webhookDeliverySchema = new Schema(
  {
    companyId: companyIdField,
    webhookId: { type: Schema.Types.ObjectId, ref: "Webhook", required: true },
    eventId: { type: String, required: true },
    event: String,
    status: { type: String, enum: ["pending", "delivered", "failed"], default: "pending" },
    ok: { type: Boolean, default: false },
    statusCode: Number,
    durationMs: Number,
    attempt: { type: Number, default: 1 },
    requestBody: { type: Schema.Types.Mixed },
    responseBody: String,
    error: String,
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false, versionKey: false },
);

webhookDeliverySchema.index({ companyId: 1, webhookId: 1, createdAt: -1 });
webhookDeliverySchema.index({ eventId: 1, webhookId: 1 }, { unique: true });
webhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 2_592_000 }); // 30d

export type WebhookDelivery = InferSchemaType<typeof webhookDeliverySchema>;
export const WebhookDeliveryModel = model("WebhookDelivery", webhookDeliverySchema);
