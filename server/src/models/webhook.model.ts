import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions, companyIdField } from "./_base.js";

/** webhooks — outbound event subscriptions. */
const webhookSchema = new Schema(
  {
    companyId: companyIdField,
    url: { type: String, required: true },
    events: { type: [String], default: [] },
    signingSecret: { type: String, required: true }, // encrypt at rest later
    status: { type: String, enum: ["active", "paused", "disabled"], default: "active" },
    description: String,
    retries: { type: Number, default: 0 },
    lastDeliveryAt: { type: Date, default: null },
    successRate: { type: Number, default: 100 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  baseOptions,
);

webhookSchema.index({ companyId: 1, status: 1 });

export type Webhook = InferSchemaType<typeof webhookSchema>;
export const WebhookModel = model("Webhook", webhookSchema);
