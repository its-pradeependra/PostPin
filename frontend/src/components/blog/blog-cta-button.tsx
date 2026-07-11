"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

/** Signup CTA on blog articles — reports which post converted the reader. */
export function BlogCtaButton({ slug }: { slug: string }) {
  return (
    <Button asChild variant="secondary" className="mt-5" data-testid="blog-post-cta-btn">
      <Link href="/signup" onClick={() => trackEvent("blog_cta_click", { post: slug })}>
        Get your free API key
      </Link>
    </Button>
  );
}
