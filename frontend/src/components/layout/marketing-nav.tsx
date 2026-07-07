"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useScroll, useMotionValueEvent } from "motion/react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/providers/session-provider";
import { marketingNav } from "@/lib/site";
import { cn, initials } from "@/lib/utils";

export function MarketingNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  // Session-aware auth area: logged-in visitors see their profile, not "Log in".
  const { status, user } = useSession();
  const dashboardHref = user?.is_platform_staff ? "/admin" : "/app";
  const firstName = user?.name.split(" ")[0] ?? "";

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
            {status === "loading" ? (
              // Placeholder keeps the header width stable while the session resolves.
              <span aria-hidden className="hidden h-9 w-36 animate-pulse rounded-full bg-muted sm:block" />
            ) : status === "authenticated" && user ? (
              <Link
                href={dashboardHref}
                data-testid="marketing-account-link"
                className="hidden items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2 text-sm font-semibold transition-colors hover:bg-accent sm:inline-flex"
              >
                <Avatar className="size-7">
                  {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name} />}
                  <AvatarFallback className="bg-brand-gradient text-[11px] text-white">
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <span data-testid="marketing-account-name">{firstName}</span>
                <Icon name="arrowRight" size={14} className="text-muted-foreground" />
              </Link>
            ) : (
              <>
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
              </>
            )}

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
                  {status === "authenticated" && user ? (
                    <Button asChild variant="gradient" className="justify-center" data-testid="marketing-mobile-dashboard-btn">
                      <Link href={dashboardHref} onClick={() => setOpen(false)}>
                        <Avatar className="size-6">
                          {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name} />}
                          <AvatarFallback className="text-[10px]">{initials(user.name)}</AvatarFallback>
                        </Avatar>
                        Open dashboard
                      </Link>
                    </Button>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
