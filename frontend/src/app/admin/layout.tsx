import type { Metadata } from "next";
import { AdminShell } from "@/components/layout/admin-shell";

// Internal admin console — never indexed.
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
