import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icons";

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: string;
  children?: React.ReactNode; // CTA
  className?: string;
  testId?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  children,
  className,
  testId,
}: EmptyStateProps) {
  return (
    <div
      data-testid={testId ?? "empty-state"}
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center",
        className,
      )}
    >
      <span className="grid size-14 place-items-center rounded-2xl bg-brand-gradient-soft text-primary">
        <Icon name={icon} size={26} />
      </span>
      <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}
