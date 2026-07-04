import { PortalShell } from "@/components/layout/portal-shell";
import { ImpersonationBanner } from "@/components/impersonation-banner";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ImpersonationBanner />
      <PortalShell>{children}</PortalShell>
    </>
  );
}
