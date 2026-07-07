import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// The pricing page is a client component, so its metadata lives in this layout.
export const metadata: Metadata = pageMetadata({
  title: "Pricing — Simple Plans for the Shipping Calculation API",
  description:
    "Transparent pricing for the Postpin shipping rate API. Start free, pay as you grow — no per-seat fees, no overage charges.",
  path: "/pricing",
  keywords: [
    "shipping API pricing",
    "shipping calculator API cost",
    "free shipping rate API",
    "shipping API plans India",
  ],
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
