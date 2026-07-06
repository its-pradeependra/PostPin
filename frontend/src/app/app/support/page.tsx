"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { listTickets } from "@/lib/api/services/tickets";
import { SupportList } from "./support-list";

export default function SupportPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["tickets"], queryFn: () => listTickets() });
  const tickets = data ?? [];
  const openCount = tickets.filter((t) => t.status === "open").length;
  const pendingCount = tickets.filter((t) => t.status === "pending").length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Support"
        title="Help & tickets"
        description="Raise a request and track conversations with the Postpin support team."
      >
        <Button variant="gradient" asChild data-testid="support-new-btn">
          <Link href="/app/support/new" className="group">
            <Icon name="plus" trigger="group-hover" size={16} className="text-white" />
            New ticket
          </Link>
        </Button>
      </PageHeader>

      <QueryBoundary isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryChip label="Total" value={tickets.length} tone="muted" testId="support-summary-total" />
          <SummaryChip label="Open" value={openCount} tone="info" testId="support-summary-open" />
          <SummaryChip label="Pending" value={pendingCount} tone="warning" testId="support-summary-pending" />
          <SummaryChip label="Resolved" value={resolvedCount} tone="success" testId="support-summary-resolved" />
        </div>

        <div className="mt-6">
          <SupportList tickets={tickets} />
        </div>
      </QueryBoundary>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: number;
  tone: "muted" | "info" | "warning" | "success";
  testId: string;
}) {
  const dot: Record<string, string> = {
    muted: "bg-muted-foreground",
    info: "bg-info",
    warning: "bg-warning",
    success: "bg-success",
  };
  return (
    <div
      data-testid={testId}
      className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3"
    >
      <span className={`size-2 rounded-full ${dot[tone]}`} />
      <div className="min-w-0">
        <p className="font-display text-xl font-bold leading-none tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
