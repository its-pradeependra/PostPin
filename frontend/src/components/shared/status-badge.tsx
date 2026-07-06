import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Variant = NonNullable<BadgeProps["variant"]>;

const MAP: Record<string, { variant: Variant; label?: string; dot?: boolean }> = {
  // generic
  active: { variant: "success", dot: true },
  inactive: { variant: "muted", dot: true },
  disabled: { variant: "muted", dot: true },
  revoked: { variant: "destructive", dot: true },
  suspended: { variant: "destructive", dot: true },
  trialing: { variant: "info", dot: true, label: "Trial" },
  invited: { variant: "warning", dot: true },
  draft: { variant: "muted" },
  published: { variant: "success" },
  scheduled: { variant: "info" },
  expired: { variant: "muted" },
  // sync
  synced: { variant: "success", dot: true },
  syncing: { variant: "info", dot: true },
  stale: { variant: "warning", dot: true },
  failed: { variant: "destructive", dot: true },
  // tickets
  open: { variant: "info", dot: true },
  pending: { variant: "warning", dot: true },
  resolved: { variant: "success", dot: true },
  closed: { variant: "muted", dot: true },
  // priority
  low: { variant: "muted" },
  medium: { variant: "info" },
  high: { variant: "warning" },
  urgent: { variant: "destructive" },
  // invoices
  paid: { variant: "success", dot: true },
  void: { variant: "muted" },
  past_due: { variant: "destructive", dot: true, label: "Past due" },
};

export function StatusBadge({
  status,
  className,
  testId,
}: {
  status: string;
  className?: string;
  testId?: string;
}) {
  const cfg = MAP[status] ?? { variant: "muted" as Variant };
  const label = cfg.label ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
  return (
    <Badge variant={cfg.variant} className={cn("capitalize", className)} data-testid={testId}>
      {cfg.dot && <span className="size-1.5 rounded-full bg-current" />}
      {label}
    </Badge>
  );
}

/** Colored dot for inline status. */
export function StatusDot({ tone }: { tone: "success" | "warning" | "info" | "destructive" | "muted" }) {
  const colors: Record<string, string> = {
    success: "bg-success",
    warning: "bg-warning",
    info: "bg-info",
    destructive: "bg-destructive",
    muted: "bg-muted-foreground",
  };
  return (
    <span className="relative inline-flex">
      <span className={cn("size-2 rounded-full", colors[tone])} />
      {tone !== "muted" && (
        <span
          className={cn("absolute inset-0 rounded-full opacity-60", colors[tone])}
          style={{ animation: "var(--animate-pulse-ring)" }}
        />
      )}
    </span>
  );
}
