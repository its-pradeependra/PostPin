"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Reveal — scroll-choreographed entrance for sections.
 *
 * Pure CSS + IntersectionObserver (no animation library), so it adds no
 * measurable JS to the marketing pages. Animates in once when it enters the
 * viewport and STAYS visible. Respects prefers-reduced-motion (shows instantly)
 * and degrades gracefully if IntersectionObserver is unavailable. Same public
 * API as before, so call sites are unchanged.
 */

type Direction = "up" | "down" | "left" | "right" | "none";

// Hidden-state transform per direction (Tailwind utilities).
const HIDDEN: Record<Direction, string> = {
  up: "translate-y-7",
  down: "-translate-y-7",
  left: "translate-x-10",
  right: "-translate-x-10",
  none: "",
};

export interface RevealProps {
  children: React.ReactNode;
  className?: string;
  direction?: Direction;
  /** Seconds of delay; use for manual staggering. */
  delay?: number;
  /** Convenience: index * stagger for grid cascades. */
  index?: number;
  stagger?: number;
  /** Re-animate every time it enters/leaves the viewport (default: reveal once and stay). */
  once?: boolean;
  /** Fraction of the element visible before it triggers. */
  amount?: number;
  /** Premium blur-in (use sparingly). */
  blur?: boolean;
  duration?: number;
  /** Render a different element (e.g. "li", "span"). */
  as?: "div" | "li" | "span" | "section" | "ul";
}

export function Reveal({
  children,
  className,
  direction = "up",
  delay,
  index,
  stagger = 0.07,
  once = true,
  amount = 0.15,
  blur = false,
  duration = 0.6,
  as = "div",
}: RevealProps) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [shown, setShown] = React.useState(false);
  const resolvedDelay = delay ?? (index != null ? index * stagger : 0);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced motion or no IO support → reveal immediately, no transition.
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            if (once) io.disconnect();
          } else if (!once) {
            setShown(false);
          }
        }
      },
      { threshold: Math.min(Math.max(amount, 0), 1), rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, amount]);

  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={cn(
        "transition-[opacity,transform,filter] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform motion-reduce:transition-none",
        shown
          ? "translate-x-0 translate-y-0 opacity-100 blur-0"
          : cn("opacity-0", HIDDEN[direction], blur && "blur-md"),
        className,
      )}
      style={{ transitionDuration: `${duration}s`, transitionDelay: shown ? `${resolvedDelay}s` : "0s" }}
    >
      {children}
    </Tag>
  );
}
