import type { Metadata } from "next";
import { PortalShell } from "@/components/layout/portal-shell";
import { ImpersonationBanner } from "@/components/impersonation-banner";

// Private customer portal — never indexed.
export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ImpersonationBanner />
      <PortalShell>{children}</PortalShell>
    </>
  );
}
