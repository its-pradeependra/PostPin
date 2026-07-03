import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions } from "./_base.js";

/** pincodeSyncLogs — audit of India Post sync runs (TTL 365d). */
const pincodeSyncLogSchema = new Schema(
  {
    trigger: { type: String, enum: ["cron", "manual", "import"], default: "manual" },
    source: { type: String, default: "india_post" },
    status: {
      type: String,
      enum: ["running", "success", "failed", "rolled_back"],
      default: "running",
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    counts: {
      scanned: { type: Number, default: 0 },
      added: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      removed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    durationMs: { type: Number, default: 0 },
    triggeredByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    failedRecords: { type: [Schema.Types.Mixed], default: [] },
    error: { type: String, default: null },
  },
  baseOptions,
);

pincodeSyncLogSchema.index({ startedAt: -1 });
pincodeSyncLogSchema.index({ status: 1, startedAt: -1 });
pincodeSyncLogSchema.index({ startedAt: 1 }, { expireAfterSeconds: 31_536_000 }); // 365d

export type PincodeSyncLog = InferSchemaType<typeof pincodeSyncLogSchema>;
export const PincodeSyncLogModel = model("PincodeSyncLog", pincodeSyncLogSchema);
