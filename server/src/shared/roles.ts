import { type PermissionKey, TENANT_PERMISSION_KEYS, PLATFORM_PERMISSION_KEYS } from "./permissions.js";

export type RoleScope = "platform" | "tenant";

export interface SystemRoleDef {
  key: string;
  name: string;
  scope: RoleScope;
  description: string;
  isDefault?: boolean;
  permissions: PermissionKey[];
}

export const SYSTEM_ROLES: SystemRoleDef[] = [
  // ── Platform roles (companyId null) ──
  {
    key: "super_admin",
    name: "Super Admin",
    scope: "platform",
    description: "Full platform control",
    permissions: [...PLATFORM_PERMISSION_KEYS],
  },
  {
    key: "support_admin",
    name: "Support Admin",
    scope: "platform",
    description: "Support & operations",
    permissions: ["tenant:read", "tenant.read", "ticket:write", "pincode:sync", "apikey:revoke.any", "audit:read"],
  },
  {
    key: "billing_admin",
    name: "Billing Admin",
    scope: "platform",
    description: "Billing & plans",
    permissions: ["tenant:read", "plan:write", "invoice:read", "invoice:refund", "coupon:write"],
  },
  {
    key: "read_only",
    name: "Read Only",
    scope: "platform",
    description: "Read-only platform access",
    permissions: ["tenant:read", "invoice:read", "audit:read"],
  },

  // ── Tenant role templates (cloned per company on signup) ──
  {
    key: "owner",
    name: "Owner",
    scope: "tenant",
    description: "Full control of the organization",
    permissions: [...TENANT_PERMISSION_KEYS],
  },
  {
    key: "developer",
    name: "Developer",
    scope: "tenant",
    description: "Build & integrate",
    permissions: [
      "usage:read",
      "apikey:read",
      "apikey:create",
      "apikey:revoke",
      "ratecard:read",
      "ratecard:write",
      "shippingrule:write",
      "webhook:write",
      "ticket:create",
    ],
  },
  {
    key: "member",
    name: "Member",
    scope: "tenant",
    description: "View-only access + support",
    isDefault: true,
    permissions: ["usage:read", "ratecard:read", "invoice:read", "ticket:create"],
  },
];

export const PLATFORM_ROLES = SYSTEM_ROLES.filter((r) => r.scope === "platform");
export const TENANT_ROLE_TEMPLATES = SYSTEM_ROLES.filter((r) => r.scope === "tenant");
export const DEFAULT_TENANT_ROLE_KEY = "member";
export const TENANT_OWNER_ROLE_KEY = "owner";
