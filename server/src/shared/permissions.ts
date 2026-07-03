/**
 * Permission catalog — the single source of truth for RBAC.
 * Format: `resource:action` (dotted sub-actions allowed). Checks are ALWAYS against
 * a permission key, never a role name.
 */
export type PermissionScope = "platform" | "tenant";

export interface PermissionDef {
  key: string;
  resource: string;
  action: string;
  group: string;
  scope: PermissionScope;
  description: string;
  isDangerous?: boolean;
}

export const PERMISSIONS = [
  // ── Tenant: usage ──
  { key: "usage:read", resource: "usage", action: "read", group: "Usage", scope: "tenant", description: "View usage & analytics" },
  // ── Tenant: developers ──
  { key: "apikey:read", resource: "apikey", action: "read", group: "Developers", scope: "tenant", description: "View API keys" },
  { key: "apikey:create", resource: "apikey", action: "create", group: "Developers", scope: "tenant", description: "Create API keys" },
  { key: "apikey:revoke", resource: "apikey", action: "revoke", group: "Developers", scope: "tenant", description: "Rotate/revoke API keys", isDangerous: true },
  { key: "ratecard:read", resource: "ratecard", action: "read", group: "Developers", scope: "tenant", description: "View rate cards" },
  { key: "ratecard:write", resource: "ratecard", action: "write", group: "Developers", scope: "tenant", description: "Edit rate cards" },
  { key: "shippingrule:write", resource: "shippingrule", action: "write", group: "Developers", scope: "tenant", description: "Edit shipping rules" },
  { key: "webhook:write", resource: "webhook", action: "write", group: "Developers", scope: "tenant", description: "Manage webhooks" },
  // ── Tenant: members ──
  { key: "member:read", resource: "member", action: "read", group: "Team", scope: "tenant", description: "View team members" },
  { key: "member:write", resource: "member", action: "write", group: "Team", scope: "tenant", description: "Invite/remove team members" },
  { key: "member:role", resource: "member", action: "role", group: "Team", scope: "tenant", description: "Change member roles", isDangerous: true },
  // ── Tenant: billing ──
  { key: "billing:read", resource: "billing", action: "read", group: "Billing", scope: "tenant", description: "View billing & subscription" },
  { key: "billing:write", resource: "billing", action: "write", group: "Billing", scope: "tenant", description: "Change plan / payment method" },
  { key: "coupon:apply", resource: "coupon", action: "apply", group: "Billing", scope: "tenant", description: "Redeem coupons" },
  { key: "invoice:read", resource: "invoice", action: "read", group: "Billing", scope: "tenant", description: "View invoices" },
  // ── Tenant: support ──
  { key: "ticket:create", resource: "ticket", action: "create", group: "Support", scope: "tenant", description: "Open support tickets" },
  // ── Tenant: security ──
  { key: "security:write", resource: "security", action: "write", group: "Security", scope: "tenant", description: "Manage security settings & sessions" },
  { key: "company:delete", resource: "company", action: "delete", group: "Security", scope: "tenant", description: "Delete the organization", isDangerous: true },

  // ── Platform ──
  { key: "tenant:read", resource: "tenant", action: "read", group: "Tenants", scope: "platform", description: "List/inspect tenants (metadata)" },
  { key: "tenant.read", resource: "tenant", action: "read.data", group: "Tenants", scope: "platform", description: "Read a tenant's scoped data (cross-tenant)", isDangerous: true },
  { key: "tenant:suspend", resource: "tenant", action: "suspend", group: "Tenants", scope: "platform", description: "Suspend/restore a tenant", isDangerous: true },
  { key: "tenant:delete", resource: "tenant", action: "delete", group: "Tenants", scope: "platform", description: "Delete a tenant", isDangerous: true },
  { key: "plan:write", resource: "plan", action: "write", group: "Billing", scope: "platform", description: "Create/edit plans" },
  { key: "invoice:refund", resource: "invoice", action: "refund", group: "Billing", scope: "platform", description: "Issue refunds", isDangerous: true },
  { key: "coupon:write", resource: "coupon", action: "write", group: "Billing", scope: "platform", description: "Create/edit coupons" },
  { key: "ticket:write", resource: "ticket", action: "write", group: "Support", scope: "platform", description: "Manage all tickets" },
  { key: "pincode:config", resource: "pincode", action: "config", group: "Pincode", scope: "platform", description: "Edit pincode/zone config" },
  { key: "pincode:sync", resource: "pincode", action: "sync", group: "Pincode", scope: "platform", description: "Trigger pincode sync" },
  { key: "pincode:rollback", resource: "pincode", action: "rollback", group: "Pincode", scope: "platform", description: "Roll back a pincode sync", isDangerous: true },
  { key: "apikey:revoke.any", resource: "apikey", action: "revoke.any", group: "Platform API", scope: "platform", description: "Force-revoke any tenant's key", isDangerous: true },
  { key: "admin:write", resource: "admin", action: "write", group: "Platform", scope: "platform", description: "Manage platform staff" },
  { key: "settings:write", resource: "settings", action: "write", group: "Platform", scope: "platform", description: "Edit platform settings" },
  { key: "audit:read", resource: "audit", action: "read", group: "Platform", scope: "platform", description: "Read audit logs" },
  { key: "audit:export", resource: "audit", action: "export", group: "Platform", scope: "platform", description: "Export audit logs" },
] as const satisfies readonly PermissionDef[];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

export const TENANT_PERMISSION_KEYS = PERMISSIONS.filter((p) => p.scope === "tenant").map((p) => p.key) as PermissionKey[];
export const PLATFORM_PERMISSION_KEYS = PERMISSIONS.filter((p) => p.scope === "platform").map((p) => p.key) as PermissionKey[];
