import { type Types } from "mongoose";
import { PermissionModel, RoleModel } from "@/models/index.js";

/** Resolve a role's machine key and the set of permission keys it grants. */
export async function resolveRolePerms(
  roleId: Types.ObjectId,
): Promise<{ roleKey: string; permissions: string[] }> {
  const role = await RoleModel.findById(roleId).select("key permissionIds").lean();
  if (!role) return { roleKey: "none", permissions: [] };
  const perms = await PermissionModel.find({ _id: { $in: role.permissionIds } })
    .select("key")
    .lean();
  return { roleKey: role.key, permissions: perms.map((p) => p.key as string) };
}
