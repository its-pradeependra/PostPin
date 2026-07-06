import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// The login page is a client component, so its metadata lives in this layout.
export const metadata: Metadata = pageMetadata({
  title: "Log in",
  description: "Log in to your Postpin dashboard to manage API keys, rate cards and usage.",
  path: "/login",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
