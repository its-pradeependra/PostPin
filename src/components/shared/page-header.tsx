import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode; // actions
  className?: string;
  eyebrow?: string;
}

export function PageHeader({ title, description, children, className, eyebrow }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1.5">
        {eyebrow && (
          <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-[15px]">{description}</p>
        )}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
