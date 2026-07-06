"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useScroll, useMotionValueEvent } from "motion/react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Icon } from "@/components/icons";
import { marketingNav } from "@/lib/site";
import { cn } from "@/lib/utils";

export function MarketingNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));

  const isActive = (href: string) => {
    const base = href.split("#")[0] || "/";
    return base === "/" ? pathname === "/" : pathname.startsWith(base);
  };

  return (
    <header className="sticky top-0 z-40 w-full">
      <div
        className={cn(
          "mx-auto px-4 transition-all duration-300 ease-out sm:px-6",
          scrolled ? "max-w-5xl pt-3" : "max-w-6xl pt-0",
        )}
      >
        <div
          className={cn(
            "relative flex h-16 items-center justify-between transition-all duration-300 ease-out",
            scrolled
              ? "rounded-2xl border border-border bg-background/75 px-3 shadow-lg shadow-primary/5 backdrop-blur-xl sm:px-4"
              : "border border-transparent",
          )}
        >
          <Logo />

          <nav
            className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 md:flex"
            aria-label="Main"
          >
            {marketingNav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-testid={`marketing-nav-${item.title.toLowerCase()}`}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {item.title}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle className="border-transparent bg-transparent" />
            <span aria-hidden="true" className="mx-0.5 hidden h-5 w-px bg-border sm:block" />
            <Link
              href="/login"
              data-testid="marketing-login-link"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent sm:inline-flex"
            >
              Log in
            </Link>
            <Button asChild variant="gradient" size="sm" className="hidden sm:inline-flex">
              <Link href="/signup" data-testid="marketing-signup-btn">
                Start free
                <Icon name="arrowRight" size={15} className="text-white" />
              </Link>
            </Button>

            {/* Mobile */}
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  data-testid="marketing-menu-btn"
                  aria-label="Open menu"
                  className="grid size-9 place-items-center rounded-lg border border-border md:hidden"
                >
                  <Icon name="menu" size={18} />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <div className="flex flex-col gap-1 p-6 pt-12">
                  {marketingNav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      className={cn(
                        "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive(item.href)
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {item.title}
                    </Link>
                  ))}
                  <div className="my-3 h-px bg-border" />
                  <Button asChild variant="outline" className="justify-start">
                    <Link href="/login" onClick={() => setOpen(false)}>
                      Log in
                    </Link>
                  </Button>
                  <Button asChild variant="gradient" className="mt-2 justify-center">
                    <Link href="/signup" onClick={() => setOpen(false)}>
                      Start free
                    </Link>
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
