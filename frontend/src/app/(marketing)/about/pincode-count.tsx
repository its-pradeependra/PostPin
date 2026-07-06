"use client";

import { useQuery } from "@tanstack/react-query";
import { getPublicStats } from "@/lib/api/services/public";
import { formatNumber } from "@/lib/format";

/**
 * Live pincode count from /public/stats, rendered as an inline text node so
 * the surrounding page can stay a server component. Shows a subtle inline
 * shimmer while loading and an em-dash if the stat can't be fetched.
 */
export function PincodeCount({ testId }: { testId?: string }) {
  const q = useQuery({ queryKey: ["public", "stats"], queryFn: getPublicStats });

  if (q.isPending) {
    return (
      <span
        data-testid={testId}
        aria-hidden
        className="inline-block h-[0.85em] w-[4ch] animate-pulse rounded bg-current align-baseline opacity-20"
      />
    );
  }
  if (q.isError || q.data == null) {
    return <span data-testid={testId}>—</span>;
  }
  return (
    <span data-testid={testId} className="tabular-nums">
      {formatNumber(q.data.pincodes)}
    </span>
  );
}
