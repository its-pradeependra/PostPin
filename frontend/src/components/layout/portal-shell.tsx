"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PlanUsageCard } from "@/components/layout/plan-usage-card";
import { useSession } from "@/components/providers/session-provider";
import { getSubscription } from "@/lib/api/services/subscription";
import { portalNav } from "@/lib/nav";

function titleCase(s: string) {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user, subscription, signOut } = useSession();

  // Live usage for the sidebar meter — shares the ["subscription"] cache with
  // the dashboard and refetches on window focus, so it tracks real API usage
  // instead of the one-shot value baked into the session at login.
  const subQ = useQuery({
    queryKey: ["subscription"],
    queryFn: getSubscription,
    enabled: status === "authenticated",
    refetchOnWindowFocus: true,
  });

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

  // Prefer the live query; fall back to the session snapshot for first paint.
  const used = subQ.data?.usage.calls_used ?? subscription?.usage.callsUsed ?? 0;
  const quota = subQ.data?.usage.included_calls ?? subscription?.usage.includedCalls ?? 0;
  const planCode = subQ.data?.plan.code ?? subscription?.plan_code;
  const planName = planCode ? titleCase(planCode) : "Free";

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
