import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      data-testid="not-found-page"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-16 text-center"
    >
      {/* Ambient brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 -z-10 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-gradient opacity-[0.08] blur-3xl"
      />

      <div className="mb-10">
        <Logo size="lg" />
      </div>

      <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-primary">
        Error 404
      </p>

      <h1 className="mt-3 font-display text-7xl font-extrabold leading-none tracking-tight text-gradient sm:text-8xl md:text-9xl">
        404
      </h1>

      <h2 className="mt-6 font-display text-2xl font-bold tracking-tight sm:text-3xl">
        Page not found
      </h2>

      <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-[15px]">
        We couldn&apos;t find the page you were looking for. It may have been moved, renamed, or
        never existed. Let&apos;s get you back on a delivered route.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Button variant="gradient" size="lg" asChild className="group" data-testid="not-found-home-btn">
          <Link href="/">
            <Icon name="arrowRight" size={16} className="text-white" />
            Back to home
          </Link>
        </Button>
        <Button variant="outline" size="lg" asChild className="group" data-testid="not-found-docs-btn">
          <Link href="/docs">
            <Icon name="book" size={16} />
            Read the docs
          </Link>
        </Button>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
        <Link
          href="/pricing"
          data-testid="not-found-pricing-link"
          className="group inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon name="tag" size={14} />
          Pricing
        </Link>
        <Link
          href="/app"
          data-testid="not-found-dashboard-link"
          className="group inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon name="dashboard" size={14} />
          Dashboard
        </Link>
        <Link
          href="/contact"
          data-testid="not-found-contact-link"
          className="group inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon name="support" size={14} />
          Contact support
        </Link>
      </div>
    </main>
  );
}
