import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// The signup page is a client component, so its metadata lives in this layout.
export const metadata: Metadata = pageMetadata({
  title: "Sign up — Get a Free Shipping API Key",
  description:
    "Create a free Postpin account and start calculating shipping charges between Indian pincodes in minutes. No credit card required.",
  path: "/signup",
  keywords: ["free shipping API key", "shipping API sign up", "try shipping rate API"],
});

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
