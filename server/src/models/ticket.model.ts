import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions, companyIdField } from "./_base.js";

/** tickets — support requests (header; replies live in ticketReplies). */
const ticketSchema = new Schema(
  {
    ticketNumber: { type: String, required: true, unique: true }, // PP-YYYY-NNNNNN
    companyId: companyIdField,
    requesterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    category: {
      type: String,
      // Aligned to the product/frontend vocabulary (src/lib/types.ts TicketCategory).
      enum: ["billing", "api", "pincode-data", "account", "feature-request", "other"],
      default: "other",
    },
    priority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium" },
    status: {
      type: String,
      enum: ["open", "pending", "on_hold", "resolved", "closed"],
      default: "open",
    },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    tags: { type: [String], default: [] },
    attachments: { type: [Schema.Types.Mixed], default: [] },
    sla: {
      policy: String,
      firstResponseDueAt: { type: Date, default: null },
      resolutionDueAt: { type: Date, default: null },
      firstRespondedAt: { type: Date, default: null },
      frBreached: { type: Boolean, default: false },
      resBreached: { type: Boolean, default: false },
    },
    channel: { type: String, enum: ["portal", "email", "api"], default: "portal" },
    lastReplyAt: { type: Date, default: null },
    lastReplyBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    replyCount: { type: Number, default: 0 },
    reopenCount: { type: Number, default: 0 },
    csatScore: { type: Number, default: null },
    closedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
  },
  baseOptions,
);

ticketSchema.index({ companyId: 1, status: 1, updatedAt: -1 });
ticketSchema.index({ assigneeId: 1, status: 1 });
ticketSchema.index({ companyId: 1, priority: 1, status: 1 });

export type Ticket = InferSchemaType<typeof ticketSchema>;
export const TicketModel = model("Ticket", ticketSchema);
