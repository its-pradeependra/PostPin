"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

/** Light/dark toggle with a crossfading sun/moon. Hydration-safe. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      data-testid="theme-toggle-btn"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative inline-flex size-9 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {!mounted ? (
        <Sun className="size-[18px]" />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isDark ? "moon" : "sun"}
            initial={{ y: -12, opacity: 0, rotate: -90 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: 12, opacity: 0, rotate: 90 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="inline-flex"
          >
            {isDark ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
          </motion.span>
        </AnimatePresence>
      )}
    </button>
  );
}
