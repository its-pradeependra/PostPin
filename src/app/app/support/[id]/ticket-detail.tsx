"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/status-badge";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import type { TicketCategory } from "@/lib/types";
import { getTicket, replyToTicket } from "@/lib/api/services/tickets";
import { ApiError } from "@/lib/api/errors";
import { TicketThread } from "./ticket-thread";

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  billing: "Billing",
  api: "API",
  "pincode-data": "Pincode data",
  account: "Account",
  "feature-request": "Feature request",
  other: "Other",
};

export function TicketDetail({ ticketNumber }: { ticketNumber: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tickets", ticketNumber], queryFn: () => getTicket(ticketNumber) });
  const ticket = q.data;

  const replyM = useMutation({
    mutationFn: (body: string) => replyToTicket(ticketNumber, body),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success(res.reopened ? "Reply sent — ticket reopened" : "Reply sent", {
        description: "We'll get back to you soon.",
      });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't send reply"),
  });

  const timeline = ticket
    ? (() => {
        const events: { label: string; at: string; tone: "info" | "warning" | "success" | "muted" }[] = [
          { label: "Ticket created", at: ticket.createdAt, tone: "info" },
        ];
        const firstAgent = ticket.messages.find((m) => m.authorRole === "agent");
        if (firstAgent) events.push({ label: "Support replied", at: firstAgent.createdAt, tone: "warning" });
        if (ticket.status === "resolved" || ticket.status === "closed") {
          events.push({
            label: ticket.status === "closed" ? "Ticket closed" : "Marked resolved",
            at: ticket.updatedAt,
            tone: "success",
          });
        }
        return events;
      })()
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Button variant="outline" asChild data-testid="ticket-detail-back-btn">
          <Link href="/app/support" className="group">
            <Icon name="arrowRight" trigger="group-hover" size={16} className="rotate-180" />
            All tickets
          </Link>
        </Button>
      </div>

      <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
        {ticket && (
          <>
            <PageHeader eyebrow={`Ticket ${ticket.id}`} title={ticket.subject} />

            {/* Header meta strip */}
            <Card>
              <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
                <Meta label="Status">
                  <StatusBadge status={ticket.status} testId="ticket-detail-status" />
                </Meta>
                <Meta label="Priority">
                  <StatusBadge status={ticket.priority} />
                </Meta>
                <Meta label="Category">
                  <Badge variant="secondary">{CATEGORY_LABEL[ticket.category]}</Badge>
                </Meta>
                <Meta label="Assignee">
                  <span className="text-sm font-medium">{ticket.assignee ?? "Unassigned"}</span>
                </Meta>
                <Meta label="Opened">
                  <span className="text-sm text-muted-foreground">{formatRelativeTime(ticket.createdAt)}</span>
                </Meta>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Conversation + composer */}
              <div className="lg:col-span-2">
                <TicketThread
                  ticket={ticket}
                  onReply={(body) => replyM.mutateAsync(body).then(() => undefined)}
                  sending={replyM.isPending}
                />
              </div>

              {/* Sidebar: status timeline + details */}
              <aside className="space-y-6">
                <Card data-testid="ticket-timeline-card">
                  <CardHeader>
                    <CardTitle className="text-base">Status timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ol className="space-y-5">
                      {timeline.map((event, i) => {
                        const dot: Record<string, string> = {
                          info: "bg-info",
                          warning: "bg-warning",
                          success: "bg-success",
                          muted: "bg-muted-foreground",
                        };
                        return (
                          <li key={`${event.label}-${i}`} className="relative flex gap-3">
                            <div className="flex flex-col items-center">
                              <span className={`mt-1 size-2.5 shrink-0 rounded-full ${dot[event.tone]}`} />
                              {i < timeline.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                            </div>
                            <div className="-mt-0.5 pb-1">
                              <p className="text-sm font-medium">{event.label}</p>
                              <p className="text-xs text-muted-foreground">{formatDateTime(event.at)}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </CardContent>
                </Card>

                <Card data-testid="ticket-details-card">
                  <CardHeader>
                    <CardTitle className="text-base">Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <Detail label="Ticket ID" value={ticket.id} mono />
                    <Separator />
                    <Detail label="Requester" value={ticket.requester.name} />
                    <Detail label="Email" value={ticket.requester.email} mono />
                    {ticket.requester.company && <Detail label="Company" value={ticket.requester.company} />}
                    <Separator />
                    <Detail label="Created" value={formatDateTime(ticket.createdAt)} />
                    <Detail label="Last update" value={formatDateTime(ticket.updatedAt)} />
                  </CardContent>
                </Card>
              </aside>
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "font-medium"}>{value}</span>
    </div>
  );
}
