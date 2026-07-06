import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { Icon } from "@/components/icons";
import { formatCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PlanUsageCard({
  planName,
  used,
  quota,
}: {
  planName: string;
  used: number;
  quota: number;
}) {
  const pct = Math.min(100, Math.round((used / quota) * 100));
  const near = pct >= 80;
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{planName} plan</span>
        <span
          className={cn(
            "font-mono text-[11px] font-semibold tabular-nums",
            near ? "text-warning" : "text-muted-foreground",
          )}
        >
          {pct}%
        </span>
      </div>
      <Progress value={pct} className="mt-2 h-1.5" indicatorClassName={near ? "bg-warning" : undefined} />
      <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
        {formatCompact(used)} / {formatCompact(quota)} calls this month
      </p>
      <Link
        href="/app/billing/plans"
        data-testid="sidebar-upgrade-link"
        className="group mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-gradient px-3 py-2 text-xs font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5"
      >
        <Icon name="rocket" size={14} className="text-white" />
        Upgrade plan
      </Link>
    </div>
  );
}
