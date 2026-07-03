import { Schema, Types } from "mongoose";

export type ObjectId = Types.ObjectId;

/** Shared schema options: createdAt/updatedAt, no __v. */
export const baseOptions = {
  timestamps: true,
  versionKey: false,
} as const;

/**
 * Tenant partition key for strictly scoped collections.
 * required + immutable: it is set once (by the scoped repository, from the auth
 * context) and can never be changed — the heart of row-level tenant isolation.
 */
export const companyIdField = {
  type: Schema.Types.ObjectId,
  ref: "Company",
  required: true,
  immutable: true,
} as const;
