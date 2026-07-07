import "dotenv/config";
import { env } from "@/config/env.js";
import { hashPassword } from "@/lib/crypto.js";
import { connectDb, disconnectDb } from "@/lib/db.js";
import { logger } from "@/lib/logger.js";
import {
  CompanyModel,
  PermissionModel,
  PincodeModel,
  PlanModel,
  RoleModel,
  SettingsModel,
  UserModel,
  ZoneModel,
  registerIndexes,
} from "@/models/index.js";
import { PERMISSIONS } from "@/shared/permissions.js";
import { PLATFORM_ROLES } from "@/shared/roles.js";
import { SEED_PLANS } from "@/data/plans.data.js";
import { SEED_PINCODES } from "@/data/pincodes.data.js";
import { SEED_ZONES } from "@/data/zones.data.js";
import { onboardCompany } from "@/services/company-onboard.service.js";

async function seedPermissions() {
  for (const p of PERMISSIONS) {
    await PermissionModel.updateOne(
      { key: p.key },
      {
        $set: {
          resource: p.resource,
          action: p.action,
          description: p.description,
          group: p.group,
          scope: p.scope,
          isDangerous: "isDangerous" in p ? p.isDangerous : false,
        },
      },
      { upsert: true },
    );
  }
  logger.info({ count: PERMISSIONS.length }, "seeded permissions");
}

async function seedPlatformRoles() {
  const perms = await PermissionModel.find({ scope: "platform" }).select("key").lean();
  const map = new Map(perms.map((p) => [p.key as string, p._id]));
  for (const r of PLATFORM_ROLES) {
    const permissionIds = r.permissions.map((k) => map.get(k)).filter(Boolean);
    await RoleModel.updateOne(
      { companyId: null, key: r.key },
      { $set: { name: r.name, description: r.description, scope: "platform", isSystem: true, permissionIds } },
      { upsert: true },
    );
  }
  logger.info({ count: PLATFORM_ROLES.length }, "seeded platform roles");
}

async function seedPlans() {
  for (const p of SEED_PLANS) {
    await PlanModel.updateOne(
      { code: p.code, version: 1 },
      { $set: { ...p, version: 1, isActive: true } },
      { upsert: true },
    );
  }
  logger.info({ count: SEED_PLANS.length }, "seeded plans");
}

async function seedSettings() {
  const settings = [
    {
      key: "engine.defaults",
      value: { gstBps: 1800, fuelBps: 1200, codFlatPaise: 3500, codPercentBps: 150, volumetricDivisor: 5000, remoteFlatPaise: 5000, minChargePaise: 0, airMultBps: 14000, expressMultBps: 16000, sameDayMultBps: 28000 },
    },
    {
      key: "pincode.sync",
      value: { endpoint: "https://api.postalpincode.in", timeIST: "00:30", retries: 3, timeoutMs: 30_000, enabled: true },
    },
    { key: "logs.retention", value: { apiLogsDays: 90, auditDays: 730, notificationsDays: 30 } },
  ];
  for (const s of settings) {
    await SettingsModel.updateOne(
      { scope: "platform", companyId: null, key: s.key },
      { $set: { value: s.value, scope: "platform", editableBy: "super_admin" } },
      { upsert: true },
    );
  }
  logger.info({ count: settings.length }, "seeded platform settings");
}

async function seedSuperAdmin() {
  const role = await RoleModel.findOne({ companyId: null, key: "super_admin" });
  if (!role) throw new Error("super_admin role missing");
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  const exists = await UserModel.findOne({ email, isPlatformStaff: true });
  if (exists) {
    logger.info({ email }, "super-admin already exists");
    return;
  }
  await UserModel.create({
    companyId: null,
    email,
    name: "Super Admin",
    passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
    roleId: role._id,
    isPlatformStaff: true,
    status: "active",
    emailVerifiedAt: new Date(),
    passwordUpdatedAt: new Date(),
    permVersion: 1,
  });
  logger.info({ email }, "seeded super-admin");
}

async function seedZones() {
  for (const z of SEED_ZONES) {
    await ZoneModel.updateOne({ code: z.code }, { $set: { ...z, isActive: true } }, { upsert: true });
  }
  logger.info({ count: SEED_ZONES.length }, "seeded zones");
}

async function seedPincodes() {
  for (const p of SEED_PINCODES) {
    await PincodeModel.updateOne(
      { pincode: p.pincode },
      { $set: { ...p, source: "manual", status: "active" } },
      { upsert: true },
    );
  }
  logger.info({ count: SEED_PINCODES.length }, "seeded sample pincodes");
}

async function seedDemoTenant() {
  const demoEmail = "aarav@flipmart.in";
  const exists = await UserModel.findOne({ email: demoEmail });
  if (exists) {
    logger.info("demo tenant already exists");
    return;
  }
  const res = await onboardCompany({
    companyName: "FlipMart Retail Pvt Ltd",
    ownerName: "Aarav Sharma",
    ownerEmail: demoEmail,
    password: "Demo_Flipmart#2026",
    emailVerified: true,
  });
  logger.info({ companyId: String(res.companyId) }, "seeded demo tenant (FlipMart)");
}

async function main() {
  await connectDb();
  await registerIndexes();
  await seedPermissions();
  await seedPlatformRoles();
  await seedPlans();
  await seedSettings();
  await seedSuperAdmin();
  await seedZones();
  await seedPincodes();
  await seedDemoTenant();
  logger.info("✅ Seed complete");
  await disconnectDb();
  process.exit(0);
}

main().catch(async (err) => {
  logger.error({ err }, "seed failed");
  await disconnectDb();
  process.exit(1);
});
