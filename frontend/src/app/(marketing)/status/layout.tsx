import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// The status page is a client component, so its metadata lives in this layout.
export const metadata: Metadata = pageMetadata({
  title: "System Status — API Uptime & Incidents",
  description:
    "Live operational status of the Postpin shipping rate API: uptime, latency and incident history.",
  path: "/status",
  keywords: ["shipping API status", "API uptime", "Postpin status page"],
});

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
