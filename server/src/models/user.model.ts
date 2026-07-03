import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions } from "./_base.js";

/** users — human accounts. companyId null = platform staff (use the admin repo). */
const userSchema = new Schema(
  {
    // Nullable for platform staff; immutable once set.
    companyId: { type: Schema.Types.ObjectId, ref: "Company", default: null, immutable: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    phone: String,
    roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true },
    isPlatformStaff: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["invited", "active", "suspended", "disabled"],
      default: "invited",
    },
    emailVerifiedAt: { type: Date, default: null },
    emailVerifyTokenHash: { type: String, default: null },
    emailVerifyExpiresAt: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: null },
    passwordResetExpiresAt: { type: Date, default: null },
    mfa: {
      enabled: { type: Boolean, default: false },
      method: { type: String, enum: ["totp"], default: "totp" },
      secretEnc: { type: String, default: null },
      backupCodesHashed: { type: [String], default: [] },
      lastTotpStep: { type: Number, default: null },
    },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: String,
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    passwordUpdatedAt: { type: Date, default: null },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    permVersion: { type: Number, default: 1 },
    locale: { type: String, default: "en-IN" },
    timezone: { type: String, default: "Asia/Kolkata" },
    notificationPrefs: { type: Schema.Types.Mixed, default: {} },
    schemaVersion: { type: Number, default: 1 },
    deletedAt: { type: Date, default: null },
  },
  baseOptions,
);

// Tenant-scoped unique email (companyId-leading) — also the isolation index.
userSchema.index(
  { companyId: 1, email: 1 },
  { unique: true, partialFilterExpression: { companyId: { $type: "objectId" } } },
);
// Global staff email uniqueness.
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { isPlatformStaff: true } },
);
userSchema.index({ companyId: 1, status: 1 });
userSchema.index({ roleId: 1 });

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);
