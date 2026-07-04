"use client";

import * as React from "react";
import Link from "next/link";
import { getPublicStatus } from "@/lib/api/services/public";

const META = {
  operational: { dot: "bg-success", label: "All systems operational" },
  degraded: { dot: "bg-warning", label: "Degraded performance" },
  outage: { dot: "bg-destructive", label: "Service disruption" },
} as const;

/** Live status pill for the marketing footer — reads the real /public/status
 * endpoint instead of hardcoding "operational". Falls back to a neutral label
 * while loading or if the API is unreachable (which itself implies trouble). */
export function FooterStatusPill() {
  const [state, setState] = React.useState<keyof typeof META | "loading" | "unreachable">("loading");

  React.useEffect(() => {
    let alive = true;
    getPublicStatus()
      .then((s) => alive && setState(s.overall))
      .catch(() => alive && setState("unreachable"));
    return () => {
      alive = false;
    };
  }, []);

  const meta =
    state === "loading"
      ? { dot: "bg-muted-foreground/50", label: "Checking status…" }
      : state === "unreachable"
        ? { dot: "bg-warning", label: "Status unavailable" }
        : META[state];

  return (
    <Link
      href="/status"
      aria-label="Status"
      data-testid="footer-status-link"
      className="group inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-accent"
    >
      <span className={`size-2 rounded-full ${meta.dot}`} data-testid="footer-status-dot" />
      {meta.label}
    </Link>
  );
}
