"use client";

import * as React from "react";
import { motion, useReducedMotion, type TargetAndTransition, type Variants } from "motion/react";
import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AnimatedIcon — wraps any Lucide icon with tasteful, transform-based motion.
 * No static icons anywhere in Postpin: every icon ships with a default
 * micro-animation. Robust by design (animates the whole glyph, never depends
 * on a specific icon's internal paths) and fully respects prefers-reduced-motion.
 *
 * Triggers:
 *  - "hover"        animate while the icon itself is hovered (default)
 *  - "group-hover"  animate when an ancestor with `.group` is hovered (nav rows, buttons)
 *  - "loop"         animate continuously (decorative / live indicators)
 *  - "mount"        animate once on mount (entrance)
 */

export type IconAnimation =
  | "pop"
  | "bounce"
  | "spin"
  | "wiggle"
  | "pulse"
  | "float"
  | "jiggle"
  | "swing"
  | "ping"
  | "draw"
  | "none";

export type IconTrigger = "hover" | "group-hover" | "loop" | "mount";

const HOVER_VARIANTS: Record<IconAnimation, Variants> = {
  pop: { rest: { scale: 1 }, active: { scale: 1.18, transition: { type: "spring", stiffness: 420, damping: 12 } } },
  bounce: { rest: { y: 0 }, active: { y: [0, -3, 0, -1.5, 0], transition: { duration: 0.6 } } },
  spin: { rest: { rotate: 0 }, active: { rotate: 360, transition: { duration: 0.6, ease: "easeInOut" } } },
  wiggle: { rest: { rotate: 0 }, active: { rotate: [0, -9, 8, -6, 0], transition: { duration: 0.5 } } },
  pulse: { rest: { scale: 1, opacity: 1 }, active: { scale: [1, 1.15, 1], transition: { duration: 0.7 } } },
  float: { rest: { y: 0 }, active: { y: [0, -2.5, 0], transition: { duration: 1.4, repeat: Infinity, ease: "easeInOut" } } },
  jiggle: { rest: { x: 0 }, active: { x: [0, -2, 2, -1.5, 0], transition: { duration: 0.45 } } },
  swing: { rest: { rotate: 0 }, active: { rotate: [0, 14, -10, 6, 0], transition: { duration: 0.7 }, transformOrigin: "top center" } },
  ping: { rest: { scale: 1 }, active: { scale: [1, 1.25, 1], transition: { duration: 0.5 } } },
  draw: { rest: { scale: 1, opacity: 1 }, active: { scale: [0.6, 1.1, 1], opacity: [0, 1, 1], transition: { duration: 0.5 } } },
  none: { rest: {}, active: {} },
};

const LOOP_VARIANTS: Partial<Record<IconAnimation, TargetAndTransition>> = {
  spin: { rotate: 360, transition: { duration: 2.4, repeat: Infinity, ease: "linear" } },
  float: { y: [0, -3, 0], transition: { duration: 2.2, repeat: Infinity, ease: "easeInOut" } },
  pulse: { scale: [1, 1.12, 1], transition: { duration: 1.8, repeat: Infinity, ease: "easeInOut" } },
  bounce: { y: [0, -3, 0], transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } },
  ping: { scale: [1, 1.18, 1], opacity: [1, 0.7, 1], transition: { duration: 1.6, repeat: Infinity } },
  wiggle: { rotate: [0, -8, 8, 0], transition: { duration: 1.8, repeat: Infinity } },
};

/** CSS group-hover transforms — cheap + reliable for nav rows and buttons. */
const GROUP_HOVER_CLASS: Record<IconAnimation, string> = {
  pop: "transition-transform duration-300 ease-out group-hover:scale-115",
  bounce: "transition-transform duration-300 ease-out group-hover:-translate-y-0.5",
  spin: "transition-transform duration-500 ease-out group-hover:rotate-180",
  wiggle: "transition-transform duration-300 ease-out group-hover:-rotate-12",
  pulse: "transition-transform duration-300 ease-out group-hover:scale-110",
  float: "transition-transform duration-300 ease-out group-hover:-translate-y-0.5",
  jiggle: "transition-transform duration-300 ease-out group-hover:translate-x-0.5",
  swing: "transition-transform duration-300 ease-out origin-top group-hover:rotate-12",
  ping: "transition-transform duration-300 ease-out group-hover:scale-110",
  draw: "transition-transform duration-300 ease-out group-hover:scale-110",
  none: "",
};

export interface AnimatedIconProps extends Omit<LucideProps, "ref"> {
  icon: LucideIcon;
  animation?: IconAnimation;
  trigger?: IconTrigger;
  /** Tailwind size utility set on the wrapper; icon inherits via width/height. */
  className?: string;
  size?: number;
  strokeWidth?: number;
}

export function AnimatedIcon({
  icon: Icon,
  animation = "pop",
  trigger = "hover",
  size = 20,
  strokeWidth = 2,
  className,
  ...iconProps
}: AnimatedIconProps) {
  const reduce = useReducedMotion();

  // Reduced motion or explicitly none: render the icon statically (still themable).
  if (reduce || animation === "none") {
    return (
      <span className={cn("inline-flex shrink-0", className)} aria-hidden="true">
        <Icon size={size} strokeWidth={strokeWidth} {...iconProps} />
      </span>
    );
  }

  if (trigger === "group-hover") {
    return (
      <span
        className={cn("inline-flex shrink-0", GROUP_HOVER_CLASS[animation], className)}
        aria-hidden="true"
      >
        <Icon size={size} strokeWidth={strokeWidth} {...iconProps} />
      </span>
    );
  }

  const variants = HOVER_VARIANTS[animation];
  const loop = trigger === "loop" ? LOOP_VARIANTS[animation] : undefined;

  return (
    <motion.span
      className={cn("inline-flex shrink-0", className)}
      aria-hidden="true"
      initial="rest"
      animate={trigger === "loop" && loop ? loop : trigger === "mount" ? "active" : "rest"}
      whileHover={trigger === "hover" ? "active" : undefined}
      variants={variants}
    >
      <Icon size={size} strokeWidth={strokeWidth} {...iconProps} />
    </motion.span>
  );
}
