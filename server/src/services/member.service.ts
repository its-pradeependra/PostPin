import type { Types } from "mongoose";
import { getContext } from "@/context/request-context.js";
import { hashPassword, randomToken, sha256 } from "@/lib/crypto.js";
import { AppError } from "@/lib/errors.js";
import { CompanyModel, PlanModel, RoleModel, SubscriptionModel, UserModel } from "@/models/index.js";
import { writeAudit } from "@/services/audit.service.js";
import { sendInviteEmail } from "@/services/email.service.js";
import { createNotification } from "@/services/notification.service.js";
import { revokeAllSessions } from "@/services/session.service.js";

/** Tenant role keys a member can hold (owner/developer/member) — matches roles.ts templates. */
export type TenantRoleKey = "owner" | "developer" | "member";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function seatCap(companyId: Types.ObjectId): Promise<number> {
  const sub = await SubscriptionModel.findOne({ companyId, status: "active" }).lean();
  if (!sub) return 1;
  const plan = await PlanModel.findById(sub.planId).lean();
  return plan?.maxTeamMembers ?? 1;
}

async function roleByKey(companyId: Types.ObjectId, key: string) {
  const role = await RoleModel.findOne({ companyId, key, scope: "tenant" }).lean();
  if (!role) throw AppError.badRequest("Unknown role", "invalid_role");
  return role;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function memberDto(u: any, roleKeyById: Map<string, string>, currentUserId: string) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: roleKeyById.get(String(u.roleId)) ?? "member",
    status: u.status === "active" ? ("active" as const) : ("invited" as const),
    last_active_at: u.lastLoginAt ?? u.createdAt,
    is_current_user: String(u._id) === currentUserId,
  };
}

export async function listMembers() {
  const { companyId, userId } = getContext();
  const [users, roles, cap] = await Promise.all([
    UserModel.find({ companyId, status: { $in: ["active", "invited"] }, deletedAt: null }).sort({ createdAt: 1 }).lean(),
    RoleModel.find({ companyId, scope: "tenant" }).select("key").lean(),
    seatCap(companyId!),
  ]);
  const roleKeyById = new Map(roles.map((r) => [String(r._id), r.key as string]));
  const cid = String(userId);
  return {
    members: users.map((u) => memberDto(u, roleKeyById, cid)),
    seat_cap: cap,
    seat_used: users.length,
  };
}

export async function inviteMember(input: { email: string; role: TenantRoleKey }) {
  const { companyId, userId } = getContext();
  const email = input.email.toLowerCase().trim();

  const exists = await UserModel.findOne({ companyId, email });
  if (exists) throw AppError.conflict("That person is already a member or has a pending invite", "email_taken");

  const cap = await seatCap(companyId!);
  const used = await UserModel.countDocuments({ companyId, status: { $in: ["active", "invited"] } });
  if (cap !== -1 && used >= cap) {
    throw AppError.conflict(`Your plan includes ${cap} seat${cap === 1 ? "" : "s"}. Upgrade to invite more teammates.`, "seat_limit");
  }

  const role = await roleByKey(companyId!, input.role);
  const inviteToken = randomToken(32);
  const placeholderHash = await hashPassword(randomToken(24)); // unusable until the invite is accepted

  const user = await UserModel.create({
    companyId,
    email,
    name: email.split("@")[0],
    passwordHash: placeholderHash,
    roleId: role._id,
    status: "invited",
    emailVerifiedAt: new Date(), // an invited address is trusted
    passwordResetTokenHash: sha256(inviteToken),
    passwordResetExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
    invitedByUserId: userId,
    permVersion: 1,
  });

  const company = await CompanyModel.findById(companyId).select("name").lean();
  await sendInviteEmail(email, inviteToken, company?.name ?? "your team");
  await writeAudit({ action: "member.invited", category: "security", resource: { kind: "user", id: String(user._id), name: email } });

  const roleKeyById = new Map([[String(role._id), role.key as string]]);
  return { member: memberDto(user, roleKeyById, String(userId)) };
}

export async function changeMemberRole(memberId: string, roleKey: TenantRoleKey) {
  const { companyId, userId } = getContext();
  if (memberId === String(userId)) throw AppError.badRequest("You can't change your own role", "self_role");

  const user = await UserModel.findOne({ _id: memberId, companyId });
  if (!user) throw AppError.notFound("Member not found");

  const ownerRole = await roleByKey(companyId!, "owner");
  const targetRole = await roleByKey(companyId!, roleKey);

  // Never leave the org without an owner.
  if (String(user.roleId) === String(ownerRole._id) && roleKey !== "owner") {
    const owners = await UserModel.countDocuments({ companyId, roleId: ownerRole._id, status: "active" });
    if (owners <= 1) throw AppError.badRequest("You can't remove the last owner", "last_owner");
  }

  user.roleId = targetRole._id;
  user.permVersion += 1; // force their access tokens to pick up the new permissions
  await user.save();
  await writeAudit({ action: "member.role_changed", category: "security", resource: { kind: "user", id: memberId }, metadata: { role: roleKey } });

  const roleKeyById = new Map([[String(targetRole._id), targetRole.key as string]]);
  return { member: memberDto(user, roleKeyById, String(userId)) };
}

export async function removeMember(memberId: string) {
  const { companyId, userId } = getContext();
  if (memberId === String(userId)) throw AppError.badRequest("You can't remove yourself", "self_remove");

  const user = await UserModel.findOne({ _id: memberId, companyId });
  if (!user) throw AppError.notFound("Member not found");

  const ownerRole = await roleByKey(companyId!, "owner");
  if (String(user.roleId) === String(ownerRole._id)) {
    const owners = await UserModel.countDocuments({ companyId, roleId: ownerRole._id, status: "active" });
    if (owners <= 1) throw AppError.badRequest("You can't remove the last owner", "last_owner");
  }

  await revokeAllSessions(user._id);
  await UserModel.deleteOne({ _id: user._id, companyId });
  await writeAudit({ action: "member.removed", category: "security", severity: "warning", resource: { kind: "user", id: memberId, name: user.email } });
  void createNotification({
    recipientId: userId,
    kind: "system",
    type: "member.removed",
    title: "Team member removed",
    body: `${user.name} no longer has access to the workspace.`,
    actionUrl: "/app/settings/team",
  });
  return { ok: true };
}
