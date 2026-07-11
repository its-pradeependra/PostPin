import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/icons";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  icon: IconName;
  deltaPct?: number;
  hint?: string;
  testId?: string;
  className?: string;
  /** Optional visual (e.g. a Sparkline) rendered BELOW the value, in flow —
   * never overlapping the number. */
  chart?: ReactNode;
}

export function StatCard({ label, value, icon, deltaPct, hint, testId, className, chart }: StatCardProps) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <Card
      data-testid={testId ?? `stat-${label.toLowerCase().replace(/[^a-z]+/g, "-")}-card`}
      className={cn("group relative overflow-hidden p-5", className)}
    >
      <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-brand-gradient opacity-[0.06] blur-2xl transition-opacity group-hover:opacity-[0.12]" />
      <div className="flex items-start justify-between">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
          <Icon name={icon} size={20} />
        </span>
        {typeof deltaPct === "number" && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
              up ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive",
            )}
          >
            {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(deltaPct).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-2xl font-bold tracking-tight tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {chart && <div className="mt-3 opacity-70">{chart}</div>}
    </Card>
  );
}
