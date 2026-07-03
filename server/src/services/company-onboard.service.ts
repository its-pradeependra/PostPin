import { type Types } from "mongoose";
import { AUTH } from "@/config/constants.js";
import { hashPassword, randomToken, sha256 } from "@/lib/crypto.js";
import { AppError } from "@/lib/errors.js";
import { logger } from "@/lib/logger.js";
import {
  CompanyModel,
  PermissionModel,
  PlanModel,
  RoleModel,
  SubscriptionModel,
  UserModel,
} from "@/models/index.js";
import { DEFAULT_PLAN_CODE } from "@/data/plans.data.js";
import { TENANT_OWNER_ROLE_KEY, TENANT_ROLE_TEMPLATES } from "@/shared/roles.js";

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "company"
  );
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 1;
  while (await CompanyModel.exists({ slug })) {
    n += 1;
    slug = `${base}-${n}`;
    if (n > 50) {
      slug = `${base}-${randomToken(4)}`;
      break;
    }
  }
  return slug;
}

export interface OnboardInput {
  companyName: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
  emailVerified?: boolean; // seed sets true so the demo tenant is immediately loginable
}

export interface OnboardResult {
  companyId: Types.ObjectId;
  ownerUserId: Types.ObjectId;
  rawVerifyToken: string | null;
}

interface Created {
  companyId?: Types.ObjectId;
  roleIds: Types.ObjectId[];
  ownerId?: Types.ObjectId;
  subId?: Types.ObjectId;
}

/**
 * Atomically (via compensating cleanup — the Mongo is standalone, no transactions)
 * create a company + its cloned tenant roles + owner user + Free subscription.
 */
export async function onboardCompany(input: OnboardInput): Promise<OnboardResult> {
  const email = input.ownerEmail.toLowerCase().trim();

  const existing = await UserModel.findOne({ email, companyId: { $type: "objectId" } });
  if (existing) throw AppError.conflict("An account with this email already exists", "email_taken");

  const plan = await PlanModel.findOne({ code: DEFAULT_PLAN_CODE, isActive: true }).sort({ version: -1 });
  if (!plan) throw new AppError("seed_missing", "Free plan not seeded — run `npm run seed`", 500);

  const perms = await PermissionModel.find({ scope: "tenant" }).select("key").lean();
  const permMap = new Map(perms.map((p) => [p.key as string, p._id as Types.ObjectId]));

  const created: Created = { roleIds: [] };

  try {
    const slug = await uniqueSlug(slugify(input.companyName));
    const company = await CompanyModel.create({
      name: input.companyName.trim(),
      slug,
      status: input.emailVerified ? "active" : "pending",
      billingEmail: email,
      onboardingStep: input.emailVerified ? "verified" : "signup",
      currency: "INR",
    });
    created.companyId = company._id;

    let ownerRoleId: Types.ObjectId | null = null;
    for (const tpl of TENANT_ROLE_TEMPLATES) {
      const permissionIds = tpl.permissions
        .map((k) => permMap.get(k))
        .filter((id): id is Types.ObjectId => Boolean(id));
      const role = await RoleModel.create({
        companyId: company._id,
        key: tpl.key,
        name: tpl.name,
        description: tpl.description,
        scope: "tenant",
        isSystem: true,
        isDefault: tpl.isDefault ?? false,
        permissionIds,
      });
      created.roleIds.push(role._id);
      if (tpl.key === TENANT_OWNER_ROLE_KEY) ownerRoleId = role._id;
    }
    if (!ownerRoleId) throw new AppError("seed_missing", "Owner role template missing", 500);

    const passwordHash = await hashPassword(input.password);
    const rawVerifyToken = input.emailVerified ? null : randomToken(32);
    const owner = await UserModel.create({
      companyId: company._id,
      email,
      name: input.ownerName.trim(),
      passwordHash,
      roleId: ownerRoleId,
      isPlatformStaff: false,
      status: input.emailVerified ? "active" : "invited",
      emailVerifiedAt: input.emailVerified ? new Date() : null,
      emailVerifyTokenHash: rawVerifyToken ? sha256(rawVerifyToken) : null,
      emailVerifyExpiresAt: rawVerifyToken ? new Date(Date.now() + AUTH.emailVerifyTtlMs) : null,
      passwordUpdatedAt: new Date(),
      permVersion: 1,
    });
    created.ownerId = owner._id;

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sub = await SubscriptionModel.create({
      companyId: company._id,
      planId: plan._id,
      planCode: plan.code,
      status: "active",
      interval: "monthly",
      priceSnapshotPaise: plan.priceMonthlyPaise,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      usage: {
        callsUsed: 0,
        includedCalls: plan.includedCalls,
        overageCalls: 0,
        periodKey: now.toISOString().slice(0, 7),
      },
      paymentProvider: "manual",
      createdByUserId: owner._id,
    });
    created.subId = sub._id;

    company.ownerUserId = owner._id;
    company.currentSubscriptionId = sub._id;
    await company.save();

    return { companyId: company._id, ownerUserId: owner._id, rawVerifyToken };
  } catch (err) {
    await cleanup(created);
    throw err;
  }
}

async function cleanup(created: Created): Promise<void> {
  try {
    if (created.subId) await SubscriptionModel.deleteOne({ _id: created.subId });
    if (created.ownerId) await UserModel.deleteOne({ _id: created.ownerId });
    if (created.roleIds.length) await RoleModel.deleteMany({ _id: { $in: created.roleIds } });
    if (created.companyId) await CompanyModel.deleteOne({ _id: created.companyId });
  } catch (e) {
    logger.error({ err: (e as Error).message }, "onboard compensating cleanup failed");
  }
}
