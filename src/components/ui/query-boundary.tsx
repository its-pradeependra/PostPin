"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { ApiError } from "@/lib/api/errors";

interface QueryBoundaryProps {
  isLoading: boolean;
  error?: unknown;
  isEmpty?: boolean;
  skeleton?: ReactNode;
  empty?: ReactNode;
  onRetry?: () => void;
  children: ReactNode;
}

/** Standard loading / error / empty wrapper for data-backed regions. */
export function QueryBoundary({ isLoading, error, isEmpty, skeleton, empty, onRetry, children }: QueryBoundaryProps) {
  if (isLoading) {
    return <>{skeleton ?? <DefaultSkeleton />}</>;
  }
  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }
  if (isEmpty) {
    return <>{empty ?? null}</>;
  }
  return <>{children}</>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : "Something went wrong while loading this.";
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <div
      data-testid="query-error-state"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card/50 p-8 text-center"
    >
      <span className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
        <Icon name="shield" size={20} />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold">Couldn&apos;t load this</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        {requestId && <p className="font-mono text-[11px] text-muted-foreground">ref: {requestId}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} data-testid="query-error-retry">
          <Icon name="sync" size={15} /> Retry
        </Button>
      )}
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="space-y-3" data-testid="query-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
