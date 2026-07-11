"use client";

import * as React from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * Fires a `docs_section_view` event the first time each docs section scrolls
 * into the middle of the viewport — shows which parts of the docs developers
 * actually read. Renders nothing.
 */
export function DocsSectionTracker({ ids }: { ids: string[] }) {
  const key = ids.join(",");
  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !seen.has(e.target.id)) {
            seen.add(e.target.id);
            trackEvent("docs_section_view", { section: e.target.id });
          }
        }
      },
      // Trigger when a section crosses the middle band of the viewport.
      { threshold: 0, rootMargin: "-40% 0px -40% 0px" },
    );
    for (const id of key.split(",")) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [key]);
  return null;
}
