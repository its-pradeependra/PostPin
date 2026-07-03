import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions } from "./_base.js";

/** notifications — in-app + email fan-out (companyId nullable for platform notices). TTL 30d. */
const notificationSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true }, // dotted key, e.g. "usage.threshold"
    kind: {
      type: String,
      enum: ["usage", "billing", "key", "sync", "ticket", "system"],
      default: "system",
    },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    severity: { type: String, enum: ["info", "success", "warning", "error"], default: "info" },
    data: { type: Schema.Types.Mixed },
    actionUrl: { type: String, default: null },
    channels: { type: [String], default: ["in_app"] },
    readAt: { type: Date, default: null },
    seenAt: { type: Date, default: null },
    groupKey: { type: String, default: null },
    expiresAt: { type: Date, default: null },
  },
  baseOptions,
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, readAt: 1 });
notificationSchema.index({ companyId: 1, createdAt: -1 });
notificationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: "date" } } },
);

export type Notification = InferSchemaType<typeof notificationSchema>;
export const NotificationModel = model("Notification", notificationSchema);
