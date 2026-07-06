"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Icon } from "@/components/icons";
import { formatRelativeTime } from "@/lib/format";
import type { Ticket, TicketStatus, TicketCategory } from "@/lib/types";

const STATUS_TABS: { value: TicketStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  billing: "Billing",
  api: "API",
  "pincode-data": "Pincode data",
  account: "Account",
  "feature-request": "Feature request",
  other: "Other",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function SupportList({ tickets }: { tickets: Ticket[] }) {
  const [status, setStatus] = useState<TicketStatus | "all">("all");

  const filtered = useMemo(
    () => (status === "all" ? tickets : tickets.filter((t) => t.status === status)),
    [tickets, status],
  );

  return (
    <div className="space-y-4">
      <Tabs value={status} onValueChange={(v) => setStatus(v as TicketStatus | "all")}>
        <TabsList data-testid="support-status-tabs" className="w-full justify-start overflow-x-auto sm:w-auto">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              data-testid={`support-filter-${tab.value}-tab`}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState
          icon="ticket"
          title="No tickets here"
          description={
            status === "all"
              ? "You haven't raised any tickets yet — we're here to help whenever you need us."
              : `No ${status} tickets right now.`
          }
          testId="support-empty-state"
        >
          <Button variant="gradient" asChild data-testid="support-empty-new-btn">
            <Link href="/app/support/new" className="group">
              <Icon name="plus" trigger="group-hover" size={16} className="text-white" />
              New ticket
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* Desktop / tablet table */}
          <Card className="hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <Table data-testid="support-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Assignee</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow
                      key={t.id}
                      data-testid={`ticket-row-${t.id}`}
                      className="group cursor-pointer"
                    >
                      <TableCell className="max-w-[320px]">
                        <Link
                          href={`/app/support/${t.id}`}
                          className="flex items-center gap-1.5 font-medium hover:text-primary"
                        >
                          <span className="truncate">{t.subject}</span>
                          <Icon
                            name="arrowRight"
                            trigger="group-hover"
                            size={14}
                            className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        </Link>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{t.id}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{CATEGORY_LABEL[t.category]}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.priority} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatRelativeTime(t.updatedAt)}
                      </TableCell>
                      <TableCell>
                        {t.assignee ? (
                          <span className="flex items-center gap-2">
                            <Avatar className="size-6">
                              <AvatarFallback className="text-[10px]">
                                {initials(t.assignee)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{t.assignee}</span>
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden" data-testid="support-card-list">
            {filtered.map((t) => (
              <Link key={t.id} href={`/app/support/${t.id}`} className="group block">
                <Card data-testid={`ticket-card-${t.id}`} className="transition-colors group-hover:border-primary/50">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium leading-snug">{t.subject}</p>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{CATEGORY_LABEL[t.category]}</Badge>
                      <StatusBadge status={t.priority} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono">{t.id}</span>
                      <span>Updated {formatRelativeTime(t.updatedAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 border-t border-border pt-3 text-sm">
                      {t.assignee ? (
                        <>
                          <Avatar className="size-6">
                            <AvatarFallback className="text-[10px]">
                              {initials(t.assignee)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{t.assignee}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
