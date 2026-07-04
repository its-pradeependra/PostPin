"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/providers/session-provider";
import { clearImpersonation, getImpersonation, type ImpersonationInfo } from "@/lib/api/impersonation";

/** Fixed banner shown while an admin is impersonating a tenant. Exiting refreshes
 * the admin's own session (from their untouched cookie) and returns to /admin. */
export function ImpersonationBanner() {
  const router = useRouter();
  const { refresh } = useSession();
  const [info, setInfo] = React.useState<ImpersonationInfo | null>(null);
  const [exiting, setExiting] = React.useState(false);

  React.useEffect(() => {
    setInfo(getImpersonation());
  }, []);

  if (!info) return null;

  async function exit() {
    setExiting(true);
    clearImpersonation();
    try {
      await refresh(); // restores the admin token from the refresh cookie
    } catch {
      // ignore — worst case the admin re-logs in
    }
    toast.success("Exited impersonation");
    router.push("/admin/users");
  }

  return (
    <div
      className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 shadow-sm"
      data-testid="impersonation-banner"
    >
      <span className="flex items-center gap-2">
        <Icon name="shield" size={16} />
        Viewing as <strong>{info.tenantName}</strong> — actions you take affect this tenant.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="border-amber-950/30 bg-amber-100 text-amber-950 hover:bg-amber-50"
        onClick={exit}
        disabled={exiting}
        data-testid="impersonation-exit-btn"
      >
        <Icon name="close" size={14} />
        {exiting ? "Exiting…" : "Exit impersonation"}
      </Button>
    </div>
  );
}
