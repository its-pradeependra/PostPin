"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Reveal — scroll-choreographed entrance for sections.
 * Animates in once when it enters the viewport and STAYS visible (never
 * gates content behind a scroll transition, so nothing ships blank).
 * Pass `delay` (or use `index`) to cascade items in a grid.
 * Fully collapses to static under prefers-reduced-motion.
 */

type Direction = "up" | "down" | "left" | "right" | "none";

const EASE = [0.16, 1, 0.3, 1] as const; // ease-out-quart

const OFFSET: Record<Direction, { x?: number; y?: number }> = {
  up: { y: 28 },
  down: { y: -28 },
  left: { x: 40 },
  right: { x: -40 },
  none: {},
};

export interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Animation direction of the incoming element. */
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
  /** Premium blur-in (use sparingly; heavier than transform/opacity). */
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
  const reduce = useReducedMotion();
  const Tag = motion[as];

  const resolvedDelay = delay ?? (index != null ? index * stagger : 0);

  if (reduce) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Tag
      className={className}
      initial={{ opacity: 0, ...OFFSET[direction], filter: blur ? "blur(10px)" : undefined }}
      whileInView={{ opacity: 1, x: 0, y: 0, filter: blur ? "blur(0px)" : undefined }}
      viewport={{ once, amount }}
      transition={{ duration, ease: EASE, delay: resolvedDelay }}
    >
      {children}
    </Tag>
  );
}
