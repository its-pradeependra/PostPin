import type { IconName } from "@/components/icons";

export interface NavLink {
  title: string;
  href: string;
  icon: IconName;
  badge?: string;
  exact?: boolean;
}

export interface NavSection {
  heading: string;
  items: NavLink[];
}

/** User dashboard sidebar — routes live under /app. */
export const portalNav: NavSection[] = [
  {
    heading: "Overview",
    items: [
      { title: "Dashboard", href: "/app", icon: "dashboard", exact: true },
      { title: "Usage", href: "/app/usage", icon: "usage" },
    ],
  },
  {
    heading: "Develop",
    items: [
      { title: "Playground", href: "/app/playground", icon: "calculator" },
      { title: "API Keys", href: "/app/keys", icon: "keys" },
      { title: "Webhooks", href: "/app/webhooks", icon: "webhook" },
      { title: "Rate Cards", href: "/app/rate-cards", icon: "rateCard" },
    ],
  },
  {
    heading: "Account",
    items: [
      { title: "Billing & Plans", href: "/app/billing", icon: "billing" },
      { title: "Support", href: "/app/support", icon: "support" },
      { title: "Notifications", href: "/app/notifications", icon: "notifications" },
      { title: "Settings", href: "/app/settings", icon: "settings" },
    ],
  },
];

/** Super Admin sidebar — routes live under /admin. */
export const adminNav: NavSection[] = [
  {
    heading: "Overview",
    items: [
      { title: "Dashboard", href: "/admin", icon: "dashboard", exact: true },
      { title: "Usage Reports", href: "/admin/usage-reports", icon: "analytics" },
    ],
  },
  {
    heading: "Customers",
    items: [
      { title: "Users", href: "/admin/users", icon: "users" },
      { title: "Plans", href: "/admin/plans", icon: "wallet" },
      { title: "Billing", href: "/admin/billing", icon: "billing" },
      { title: "Coupons", href: "/admin/coupons", icon: "percent" },
      { title: "Tickets", href: "/admin/tickets", icon: "ticket" },
    ],
  },
  {
    heading: "Logistics data",
    items: [
      { title: "Pincode Master", href: "/admin/pincodes", icon: "pin" },
      { title: "Sync Settings", href: "/admin/pincodes/sync-settings", icon: "sync" },
      { title: "Sync Logs", href: "/admin/pincodes/sync-logs", icon: "audit" },
      { title: "Zones", href: "/admin/zones", icon: "zones" },
      { title: "Rate Cards", href: "/admin/rate-cards", icon: "rateCard" },
    ],
  },
  {
    heading: "Content",
    items: [{ title: "Blog", href: "/admin/blog", icon: "fileText" }],
  },
  {
    heading: "Platform",
    items: [
      { title: "API Keys Audit", href: "/admin/api-keys-audit", icon: "keys" },
      { title: "Audit Logs", href: "/admin/audit-logs", icon: "shield" },
      { title: "Notifications", href: "/admin/notifications", icon: "bellRing" },
      { title: "Sub-Admins", href: "/admin/team", icon: "admin" },
      { title: "Settings", href: "/admin/settings", icon: "settings" },
    ],
  },
];
