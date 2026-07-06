"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useSession } from "@/components/providers/session-provider";
import { adminNav } from "@/lib/nav";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user, signOut } = useSession();

  React.useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (status === "authenticated" && user && !user.is_platform_staff) {
      router.replace("/app"); // signed in, but not platform staff
    }
  }, [status, user, pathname, router]);

  const handleSignOut = React.useCallback(async () => {
    await signOut();
    router.replace("/login");
  }, [signOut, router]);

  if (status !== "authenticated" || !user || !user.is_platform_staff) {
    return (
      <div
        className="grid min-h-dvh place-items-center text-sm text-muted-foreground"
        data-testid="admin-auth-loading"
      >
        Loading…
      </div>
    );
  }

  return (
    <DashboardShell
      sections={adminNav}
      variant="admin"
      user={{
        name: user.name,
        email: user.email,
        // Uploaded profile photo wins; generated placeholder only when none exists.
        avatar:
          user.avatar_url ?? `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(user.name)}`,
      }}
      onSignOut={handleSignOut}
    >
      {children}
    </DashboardShell>
  );
}
