"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

const TABS: { href: string; label: string; icon: IconName; testId: string }[] = [
  { href: "/app/settings", label: "Profile", icon: "profile", testId: "settings-nav-profile-link" },
  { href: "/app/settings/team", label: "Team", icon: "users", testId: "settings-nav-team-link" },
  {
    href: "/app/settings/security",
    label: "Security",
    icon: "shield",
    testId: "settings-nav-security-link",
  },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <div
      className="-mx-1 overflow-x-auto"
      role="navigation"
      aria-label="Settings sections"
      data-testid="settings-subnav"
    >
      <div className="inline-flex min-w-full items-center gap-1 rounded-xl border border-border bg-muted/40 p-1 sm:min-w-0 sm:w-fit">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              data-testid={tab.testId}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                name={tab.icon}
                size={16}
                className={active ? "text-primary" : undefined}
              />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
