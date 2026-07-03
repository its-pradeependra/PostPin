/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FilterQuery, Model, PipelineStage, Types, UpdateQuery } from "mongoose";
import { getContext } from "@/context/request-context.js";
import { writeAudit } from "@/services/audit.service.js";
import { AppError } from "@/lib/errors.js";

// Never accepted from callers — always derived from context.
const IMMUTABLE_ON_CREATE = ["companyId", "_id", "createdAt", "updatedAt"];
const IMMUTABLE_ON_UPDATE = ["companyId", "createdBy", "createdByUserId", "_id", "createdAt"];

function stripKeys<T extends Record<string, any>>(obj: T, keys: string[]): T {
  const copy: Record<string, any> = { ...obj };
  let tampered = false;
  for (const k of keys) {
    if (k in copy) {
      if (k === "companyId") tampered = true;
      delete copy[k];
    }
  }
  if (tampered) {
    // Defense layer 2: a client tried to set companyId — drop it and record a tamper signal.
    void writeAudit({
      action: "tenant.body_injection",
      category: "security",
      severity: "warning",
      outcome: "denied",
      metadata: { attempted: true },
    });
  }
  return copy as T;
}

function stripUpdate<T extends Record<string, any>>(update: T): T {
  const copy: Record<string, any> = stripKeys(update, IMMUTABLE_ON_UPDATE);
  if (copy.$set) copy.$set = stripKeys(copy.$set, IMMUTABLE_ON_UPDATE);
  if (copy.$setOnInsert) copy.$setOnInsert = stripKeys(copy.$setOnInsert, IMMUTABLE_ON_UPDATE);
  return copy as T;
}

/**
 * A tenant-scoped view over a Mongoose model. EVERY query is constrained to the
 * caller's companyId (from context); create() forces companyId; update() forbids
 * changing it. This is the single primitive all tenant-facing data access uses.
 */
export function scopedRepo<T = any>(model: Model<any>) {
  const { companyId } = getContext();
  if (!companyId) {
    throw new AppError("scoped_repo_requires_tenant", "This operation requires a tenant context", 403);
  }
  const scope = { companyId } as FilterQuery<T>;

  return {
    companyId,
    model,
    find(filter: FilterQuery<T> = {}) {
      return model.find({ ...filter, ...scope });
    },
    findOne(filter: FilterQuery<T> = {}) {
      return model.findOne({ ...filter, ...scope });
    },
    // 404-before-403: a foreign _id simply doesn't match the scope → null.
    findById(id: string | Types.ObjectId) {
      return model.findOne({ _id: id, ...scope } as FilterQuery<T>);
    },
    create(doc: Partial<T> & Record<string, any>) {
      return model.create({ ...stripKeys(doc, IMMUTABLE_ON_CREATE), companyId });
    },
    updateOne(filter: FilterQuery<T>, update: UpdateQuery<T>) {
      return model.updateOne({ ...filter, ...scope }, stripUpdate(update as any));
    },
    findByIdAndUpdate(id: string | Types.ObjectId, update: UpdateQuery<T>) {
      return model.findOneAndUpdate({ _id: id, ...scope } as FilterQuery<T>, stripUpdate(update as any), {
        new: true,
      });
    },
    deleteOne(filter: FilterQuery<T> = {}) {
      return model.deleteOne({ ...filter, ...scope });
    },
    deleteMany(filter: FilterQuery<T> = {}) {
      return model.deleteMany({ ...filter, ...scope });
    },
    // 404-before-403: a foreign _id simply doesn't match the scope → null.
    findByIdAndDelete(id: string | Types.ObjectId) {
      return model.findOneAndDelete({ _id: id, ...scope } as FilterQuery<T>);
    },
    countDocuments(filter: FilterQuery<T> = {}) {
      return model.countDocuments({ ...filter, ...scope });
    },
    aggregate(pipeline: PipelineStage[]) {
      return model.aggregate([{ $match: { companyId } }, ...pipeline]);
    },
  };
}

export type ScopedRepo<T> = ReturnType<typeof scopedRepo<T>>;
