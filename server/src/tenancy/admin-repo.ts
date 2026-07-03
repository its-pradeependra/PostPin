/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FilterQuery, Model, Types } from "mongoose";
import { getContext } from "@/context/request-context.js";
import { writeAudit } from "@/services/audit.service.js";
import { AppError } from "@/lib/errors.js";

/**
 * The ONLY sanctioned path that reads across tenants. Requires the explicit
 * `tenant.read` permission and records every access in auditLogs. Used solely by
 * platform-admin routes (tenant directory, impersonation, cross-tenant reports).
 */
// `Model<any>` (not `Model<T>`) sidesteps Mongoose 8 generic variance — same as scopedRepo.
export function adminRepo<T = any>(model: Model<any>, targetCompanyId?: Types.ObjectId | string) {
  const ctx = getContext();
  if (!ctx.permissions.has("tenant.read")) {
    throw new AppError("forbidden", "Cross-tenant access requires the tenant.read permission", 403);
  }

  void writeAudit({
    action: "admin.cross_tenant.read",
    category: "security",
    severity: "notice",
    resource: { kind: model.modelName, id: targetCompanyId ? String(targetCompanyId) : undefined },
    metadata: { model: model.modelName, targetCompanyId: targetCompanyId ? String(targetCompanyId) : null },
  });

  const base: FilterQuery<T> = targetCompanyId ? ({ companyId: targetCompanyId } as FilterQuery<T>) : {};

  return {
    find(filter: FilterQuery<T> = {}) {
      return model.find({ ...base, ...filter });
    },
    findOne(filter: FilterQuery<T> = {}) {
      return model.findOne({ ...base, ...filter });
    },
    findById(id: string | Types.ObjectId) {
      return model.findById(id);
    },
    countDocuments(filter: FilterQuery<T> = {}) {
      return model.countDocuments({ ...base, ...filter });
    },
  };
}
