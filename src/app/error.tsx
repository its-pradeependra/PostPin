"use client";

import * as React from "react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Icon } from "@/components/icons";
import { CopyButton } from "@/components/shared/copy-button";
import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Static placeholder request id surfaced to support (the real one comes from the API later). */
const REQUEST_ID = "req_9f3a7c21e8b04d6f";

export default function Error({ error, reset }: ErrorProps) {
  React.useEffect(() => {
    // In production this would report to the error tracker.
    console.error(error);
  }, [error]);

  const requestId = error.digest ?? REQUEST_ID;

  return (
    <main
      data-testid="error-page"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-16 text-center"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 -z-10 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-gradient opacity-[0.08] blur-3xl"
      />

      <div className="mb-10">
        <Logo size="lg" />
      </div>

      <span className="grid size-16 place-items-center rounded-2xl bg-destructive/12 text-destructive">
        <Icon name="shield" animation="pulse" trigger="loop" size={30} />
      </span>

      <p className="mt-6 font-mono text-xs font-medium uppercase tracking-[0.18em] text-destructive">
        Unexpected error
      </p>

      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        Something went wrong
      </h1>

      <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-[15px]">
        An unexpected error interrupted this request. Our team has been notified. You can try again,
        or head back home. If it keeps happening, share the request id below with support.
      </p>

      {/* Copyable request id */}
      <div
        data-testid="error-request-id"
        className="mt-6 inline-flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5"
      >
        <span className="text-xs font-medium text-muted-foreground">Request ID</span>
        <code className="font-mono text-sm tabular-nums text-foreground">{requestId}</code>
        <CopyButton
          value={requestId}
          label="Copy"
          testId="error-copy-request-id-btn"
          toastMessage="Request ID copied"
        />
      </div>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Button
          variant="gradient"
          size="lg"
          onClick={() => reset()}
          className="group"
          data-testid="error-try-again-btn"
        >
          <Icon name="sync" trigger="group-hover" size={16} className="text-white" />
          Try again
        </Button>
        <Button variant="outline" size="lg" asChild className="group" data-testid="error-home-btn">
          <Link href="/">
            <Icon name="arrowRight" trigger="group-hover" size={16} />
            Back to home
          </Link>
        </Button>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
        <Link
          href="/docs"
          data-testid="error-docs-link"
          className="group inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon name="book" trigger="group-hover" size={14} />
          Read the docs
        </Link>
        <Link
          href="/contact"
          data-testid="error-contact-link"
          className="group inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon name="support" trigger="group-hover" size={14} />
          Contact support
        </Link>
      </div>
    </main>
  );
}
