import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions, companyIdField } from "./_base.js";

/** ticketReplies — thread messages within a ticket. */
const ticketReplySchema = new Schema(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: "Ticket", required: true },
    companyId: companyIdField,
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorRole: { type: String, enum: ["requester", "agent", "system"], default: "requester" },
    body: { type: String, required: true },
    isInternal: { type: Boolean, default: false },
    attachments: { type: [Schema.Types.Mixed], default: [] },
    statusChange: {
      from: { type: String, default: null },
      to: { type: String, default: null },
    },
    isDeleted: { type: Boolean, default: false },
  },
  baseOptions,
);

ticketReplySchema.index({ ticketId: 1, createdAt: 1 });
ticketReplySchema.index({ companyId: 1, createdAt: -1 });

export type TicketReply = InferSchemaType<typeof ticketReplySchema>;
export const TicketReplyModel = model("TicketReply", ticketReplySchema);
