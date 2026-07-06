"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getUnreadCount } from "@/lib/api/services/notifications";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Icon } from "@/components/icons";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";
import type { NavSection } from "@/lib/nav";

interface DashboardShellProps {
  sections: NavSection[];
  variant?: "portal" | "admin";
  user: { name: string; email: string; avatar?: string };
  footer?: React.ReactNode;
  onSignOut?: () => void;
  children: React.ReactNode;
}

export function DashboardShell({
  sections,
  variant = "portal",
  user,
  footer,
  onSignOut,
  children,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isPortal = variant !== "admin";
  const notificationsHref = variant === "admin" ? "/admin/notifications" : "/app/notifications";
  const homeHref = variant === "admin" ? "/admin" : "/app";

  // Live unread indicator for the tenant portal (admin notifications land in M6).
  const { data: unread } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadCount,
    enabled: isPortal,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const unreadCount = isPortal ? (unread?.unreadCount ?? 0) : 0;

  const sidebarInner = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 px-5">
        <Logo href={homeHref} />
        {variant === "admin" && (
          <Badge variant="gradient" className="ml-1 text-[10px]">
            Admin
          </Badge>
        )}
      </div>
      <SidebarNav sections={sections} onNavigate={() => setMobileOpen(false)} />
      {footer && <div className="border-t border-sidebar-border p-3">{footer}</div>}
    </div>
  );

  return (
    <div className="min-h-dvh bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar lg:block">
        {sidebarInner}
      </aside>

      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                data-testid="mobile-menu-btn"
                aria-label="Open menu"
                className="grid size-9 place-items-center rounded-lg border border-border lg:hidden"
              >
                <Icon name="menu" size={18} />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              {sidebarInner}
            </SheetContent>
          </Sheet>

          {/* Search (command palette placeholder) */}
          <button
            type="button"
            data-testid="topbar-search-btn"
            className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:flex sm:w-64 md:w-72"
          >
            <Icon name="search" size={15} />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="rounded border border-border bg-background px-1.5 font-mono text-[10px]">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/docs"
              data-testid="topbar-docs-link"
              className="group hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:flex"
            >
              <Icon name="docs" size={16} />
              Docs
            </Link>
            <Link
              href={notificationsHref}
              data-testid="topbar-notifications-link"
              aria-label="Notifications"
              className="group relative grid size-9 place-items-center rounded-lg border border-border transition-colors hover:bg-accent"
            >
              <Icon name="notifications" size={18} />
              {unreadCount > 0 && (
                <span
                  className="absolute right-2 top-2 size-2 rounded-full bg-fuchsia ring-2 ring-background"
                  aria-label={`${unreadCount} unread notifications`}
                  data-testid="topbar-notifications-unread-dot"
                />
              )}
            </Link>
            <ThemeToggle />
            <div className="mx-1 h-6 w-px bg-border" />
            <UserMenu name={user.name} email={user.email} avatar={user.avatar} variant={variant} onSignOut={onSignOut} />
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
