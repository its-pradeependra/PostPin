"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/providers/session-provider";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import {
  adminReplyTicket,
  adminUpdateTicket,
  getAdminTicket,
  listAdminStaff,
  type AdminTicketDetail,
  type AdminTicketMessage,
} from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";

type TicketStatus = AdminTicketDetail["status"];
type TicketPriority = AdminTicketDetail["priority"];

const CATEGORY_LABEL: Record<string, string> = {
  billing: "Billing",
  api: "API",
  "pincode-data": "Pincode data",
  account: "Account",
  "feature-request": "Feature request",
  other: "Other",
};

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "on_hold", label: "On hold" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const UNASSIGNED = "__unassigned__";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TicketWorkspace({ ticketNumber }: { ticketNumber: string }) {
  const qc = useQueryClient();
  const { user } = useSession();

  const q = useQuery({
    queryKey: ["admin", "tickets", ticketNumber],
    queryFn: () => getAdminTicket(ticketNumber),
  });
  const staffQ = useQuery({ queryKey: ["admin", "staff"], queryFn: listAdminStaff });

  const ticket = q.data;
  const staff = staffQ.data ?? [];

  const updateM = useMutation({
    mutationFn: (patch: { status?: string; priority?: string; assignee_id?: string | null }) =>
      adminUpdateTicket(ticketNumber, patch),
    onSuccess: (_res, patch) => {
      void qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
      if (patch.status === "resolved") {
        toast.success("Ticket marked resolved");
      } else if (patch.status) {
        toast.success(`Status set to ${patch.status.replace(/_/g, " ")}`);
      } else if (patch.priority) {
        toast.success(`Priority set to ${patch.priority}`);
      } else if (patch.assignee_id === null) {
        toast.success("Ticket unassigned");
      } else if (patch.assignee_id) {
        const name = staff.find((s) => s.id === patch.assignee_id)?.name;
        toast.success(name ? `Assigned to ${name}` : "Ticket assigned");
      }
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't update the ticket"),
  });

  const replyM = useMutation({
    mutationFn: ({ body, internal }: { body: string; internal: boolean }) =>
      adminReplyTicket(ticketNumber, body, internal),
    onSuccess: (_res, vars) => {
      void qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
      toast.success(vars.internal ? "Internal note added" : "Public reply sent", {
        description: vars.internal ? "Visible to staff only." : "The customer was emailed.",
      });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't send your message"),
  });

  // Assignee options: staff directory, plus the current assignee if they're not in it.
  const assigneeOptions =
    ticket?.assignee && !staff.some((s) => s.id === ticket.assignee?.id)
      ? [{ id: ticket.assignee.id, name: ticket.assignee.name }, ...staff]
      : staff;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="outline" asChild data-testid="ticket-detail-back-btn">
          <Link href="/admin/tickets" className="group">
            <Icon name="arrowRight" size={16} className="rotate-180" />
            All tickets
          </Link>
        </Button>
      </div>

      <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
        {ticket && (
          <>
            <PageHeader eyebrow={`Ticket ${ticket.id}`} title={ticket.subject} />

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Main column: status controls + thread + composers */}
              <div className="space-y-6 lg:col-span-2">
                {/* Header controls */}
                <Card data-testid="ticket-controls-card">
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-end">
                    <Control label="Status" htmlFor="ticket-status">
                      <Select
                        value={ticket.status}
                        onValueChange={(v) => v !== ticket.status && updateM.mutate({ status: v })}
                        disabled={updateM.isPending}
                      >
                        <SelectTrigger
                          id="ticket-status"
                          className="w-full sm:w-[150px]"
                          data-testid="ticket-status-select"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Control>

                    <Control label="Priority" htmlFor="ticket-priority">
                      <Select
                        value={ticket.priority}
                        onValueChange={(v) => v !== ticket.priority && updateM.mutate({ priority: v })}
                        disabled={updateM.isPending}
                      >
                        <SelectTrigger
                          id="ticket-priority"
                          className="w-full sm:w-[150px]"
                          data-testid="ticket-priority-select"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Control>

                    <Control label="Assignee" htmlFor="ticket-assignee">
                      <Select
                        value={ticket.assignee?.id ?? UNASSIGNED}
                        onValueChange={(v) => {
                          const next = v === UNASSIGNED ? null : v;
                          if (next !== (ticket.assignee?.id ?? null)) updateM.mutate({ assignee_id: next });
                        }}
                        disabled={updateM.isPending}
                      >
                        <SelectTrigger
                          id="ticket-assignee"
                          className="w-full sm:w-[180px]"
                          data-testid="ticket-assignee-select"
                        >
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                          {assigneeOptions.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                              {a.id === user?.id ? " (me)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Control>

                    <Button
                      variant="success"
                      className="group sm:ml-auto"
                      onClick={() => updateM.mutate({ status: "resolved" })}
                      disabled={updateM.isPending || ticket.status === "resolved" || ticket.status === "closed"}
                      data-testid="ticket-resolve-btn"
                    >
                      <Icon name="checkCircle" size={16} />
                      Resolve
                    </Button>
                  </CardContent>
                </Card>

                {/* Conversation thread */}
                <Card data-testid="ticket-thread-card">
                  <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                    <CardTitle className="text-base">Conversation</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{CATEGORY_LABEL[ticket.category] ?? ticket.category}</Badge>
                      <Badge variant="muted">
                        {ticket.messages.length} message{ticket.messages.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {ticket.messages.map((m) => (
                      <ThreadBubble key={m.id} entry={m} />
                    ))}
                  </CardContent>
                </Card>

                {/* Composers */}
                <Composer
                  onSend={(body, internal) => replyM.mutateAsync({ body, internal })}
                  sending={replyM.isPending}
                />
              </div>

              {/* Right sidebar */}
              <aside className="space-y-6">
                <Card data-testid="ticket-requester-card">
                  <CardHeader>
                    <CardTitle className="text-base">Requester</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-10">
                        <AvatarFallback>{initials(ticket.requester.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{ticket.requester.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {ticket.requester.email}
                        </p>
                      </div>
                    </div>
                    <Separator />
                    {ticket.requester.company && (
                      <Detail label="Company" value={ticket.requester.company} />
                    )}
                    <Detail label="Ticket ID" value={ticket.id} mono />
                    <Detail label="Opened" value={formatDateTime(ticket.createdAt)} />
                    <Detail label="Last update" value={formatRelativeTime(ticket.updatedAt)} />
                    <Separator />
                    <Detail label="Status">
                      <StatusBadge status={ticket.status} />
                    </Detail>
                    <Detail label="Priority">
                      <StatusBadge status={ticket.priority} />
                    </Detail>
                    <Detail label="Assignee">
                      <span className="font-medium">{ticket.assignee?.name ?? "Unassigned"}</span>
                    </Detail>
                  </CardContent>
                </Card>

                <Card data-testid="ticket-sla-card">
                  <CardHeader>
                    <CardTitle className="text-base">SLA</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Icon name="clock" size={14} className="text-muted-foreground" />
                        <span className="text-sm font-medium">Resolution</span>
                      </div>
                      <Badge variant={ticket.sla.variant} data-testid="ticket-sla-chip">
                        {ticket.sla.label}
                      </Badge>
                    </div>
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

function Composer({
  onSend,
  sending,
}: {
  onSend: (body: string, internal: boolean) => Promise<unknown>;
  sending: boolean;
}) {
  const [tab, setTab] = useState<"reply" | "note">("reply");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");

  function sendReply() {
    const body = reply.trim();
    if (!body) {
      toast.error("Write a reply before sending.");
      return;
    }
    onSend(body, false).then(
      () => setReply(""),
      () => {}, // error toast handled by the mutation
    );
  }

  function addNote() {
    const body = note.trim();
    if (!body) {
      toast.error("Write a note before adding.");
      return;
    }
    onSend(body, true).then(
      () => setNote(""),
      () => {},
    );
  }

  const isNote = tab === "note";

  return (
    <Card
      data-testid="ticket-composer-card"
      className={cn("transition-colors", isNote && "border-warning/40 bg-warning/5")}
    >
      <CardContent className="space-y-3 p-4">
        {/* Toggle */}
        <div
          className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
          role="tablist"
          aria-label="Reply type"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!isNote}
            onClick={() => setTab("reply")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              !isNote ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
            data-testid="ticket-composer-reply-tab"
          >
            <Icon name="message" size={14} />
            Public reply
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isNote}
            onClick={() => setTab("note")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isNote ? "bg-background text-warning shadow-sm" : "text-muted-foreground",
            )}
            data-testid="ticket-composer-note-tab"
          >
            <Icon name="lock" size={14} />
            Internal note
          </button>
        </div>

        {isNote ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="warning" className="gap-1">
                <Icon name="lock" size={11} />
                Internal
              </Badge>
              <span className="text-xs text-muted-foreground">
                Only staff can see this — the customer is never notified.
              </span>
            </div>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add an internal note for the team…"
              className="bg-background"
              data-testid="ticket-note-input"
            />
            <div className="flex items-center justify-end">
              <Button
                variant="secondary"
                className="group border border-warning/40 bg-warning/15 text-warning hover:bg-warning/25"
                onClick={addNote}
                disabled={sending || !note.trim()}
                data-testid="ticket-note-submit-btn"
              >
                <Icon name="lock" size={15} />
                {sending ? "Adding…" : "Add internal note"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              rows={4}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a public reply to the customer…"
              data-testid="ticket-reply-input"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="gradient"
                className="group"
                onClick={sendReply}
                disabled={sending || !reply.trim()}
                data-testid="ticket-reply-submit-btn"
              >
                <Icon name="send" size={16} className="text-white" />
                {sending ? "Sending…" : "Send reply"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ThreadBubble({ entry }: { entry: AdminTicketMessage }) {
  if (entry.internal) {
    return (
      <div
        data-testid={`ticket-message-${entry.id}`}
        className="rounded-2xl border border-warning/40 bg-warning/10 p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{entry.author}</span>
          <Badge variant="warning" className="gap-1">
            <Icon name="lock" size={11} />
            Internal note
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(entry.createdAt)}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed">{entry.body}</p>
      </div>
    );
  }

  const isAgent = entry.authorRole === "agent";
  return (
    <div
      data-testid={`ticket-message-${entry.id}`}
      className={cn("flex gap-3", isAgent ? "flex-row-reverse" : "justify-start")}
    >
      <Avatar className="size-8 shrink-0">
        <AvatarFallback
          className={cn("text-[11px]", isAgent && "bg-secondary text-secondary-foreground")}
        >
          {initials(entry.author)}
        </AvatarFallback>
      </Avatar>
      <div className={cn("min-w-0 max-w-[85%] space-y-1.5", isAgent ? "items-end text-right" : "items-start")}>
        <div className={cn("flex items-center gap-2", isAgent ? "flex-row-reverse" : "justify-start")}>
          <span className="text-sm font-semibold">{entry.author}</span>
          <Badge variant={isAgent ? "gradient" : "info"} className="h-5 px-1.5 text-[10px]">
            {isAgent ? "Agent" : "Customer"}
          </Badge>
        </div>
        <div
          className={cn(
            "rounded-2xl border px-4 py-2.5 text-left text-sm leading-relaxed",
            isAgent ? "border-primary/20 bg-brand-gradient-soft" : "border-border bg-secondary",
          )}
        >
          {entry.body}
        </div>
        <p className="text-xs text-muted-foreground">{formatRelativeTime(entry.createdAt)}</p>
      </div>
    </div>
  );
}

function Control({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {children ?? <span className={mono ? "font-mono text-xs" : "font-medium"}>{value}</span>}
    </div>
  );
}
