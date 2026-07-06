import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Static icon wrapper. (Historically this carried a micro-animation layer;
 * that was removed entirely — icons never animate.) The name/exports are kept
 * so existing imports compile; it simply renders a Lucide glyph in a span.
 */
export interface AnimatedIconProps extends Omit<LucideProps, "ref"> {
  icon: LucideIcon;
  /** Tailwind size utility set on the wrapper; icon inherits via width/height. */
  className?: string;
  size?: number;
  strokeWidth?: number;
}

export function AnimatedIcon({
  icon: Icon,
  size = 20,
  strokeWidth = 2,
  className,
  ...iconProps
}: AnimatedIconProps) {
  return (
    <span className={cn("inline-flex shrink-0", className)} aria-hidden="true">
      <Icon size={size} strokeWidth={strokeWidth} {...iconProps} />
    </span>
  );
}
