"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PlanUsageCard } from "@/components/layout/plan-usage-card";
import { useSession } from "@/components/providers/session-provider";
import { portalNav } from "@/lib/nav";

function titleCase(s: string) {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user, subscription, signOut } = useSession();

  React.useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [status, pathname, router]);

  const handleSignOut = React.useCallback(async () => {
    await signOut();
    router.replace("/login");
  }, [signOut, router]);

  if (status !== "authenticated" || !user) {
    return (
      <div
        className="grid min-h-dvh place-items-center text-sm text-muted-foreground"
        data-testid="portal-auth-loading"
      >
        Loading…
      </div>
    );
  }

  const used = subscription?.usage.callsUsed ?? 0;
  const quota = subscription?.usage.includedCalls ?? 0;
  const planName = subscription ? titleCase(subscription.plan_code) : "Free";

  return (
    <DashboardShell
      sections={portalNav}
      variant="portal"
      user={{
        name: user.name,
        email: user.email,
        // Uploaded profile photo wins; generated placeholder only when none exists.
        avatar:
          user.avatar_url ?? `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(user.name)}`,
      }}
      onSignOut={handleSignOut}
      footer={<PlanUsageCard planName={planName} used={used} quota={quota} />}
    >
      {children}
    </DashboardShell>
  );
}
