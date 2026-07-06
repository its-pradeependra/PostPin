"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/providers/session-provider";
import { formatRelativeTime } from "@/lib/format";
import { adminUpdateTicket, listAdminTickets, type AdminTicketRow } from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";

type TicketStatus = AdminTicketRow["status"];
type TicketPriority = AdminTicketRow["priority"];

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

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TicketsQueue() {
  const qc = useQueryClient();
  const { user } = useSession();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<TicketStatus | "all">("all");
  const [priority, setPriority] = useState<TicketPriority | "all">("all");
  const [assignee, setAssignee] = useState<string>("all");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const params = useMemo(() => {
    const p: { status?: string; priority?: string; q?: string } = {};
    if (status !== "all") p.status = status;
    if (priority !== "all") p.priority = priority;
    if (debouncedQuery) p.q = debouncedQuery;
    return p;
  }, [status, priority, debouncedQuery]);

  const listQ = useQuery({
    queryKey: ["admin", "tickets", params],
    queryFn: () => listAdminTickets(params),
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => listQ.data ?? [], [listQ.data]);

  // Summary chips derived from the fetched (server-filtered) list.
  const openCount = rows.filter((t) => t.status === "open").length;
  const unassignedCount = rows.filter((t) => t.assignee === null).length;
  const breachingCount = rows.filter((t) => t.sla.breached).length;
  const urgentCount = rows.filter((t) => t.priority === "urgent").length;

  // Assignee filter stays client-side over the fetched rows.
  const assignees = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((t) => t.assignee && set.add(t.assignee.name));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((t) => {
      if (assignee === "unassigned" && t.assignee !== null) return false;
      if (assignee !== "all" && assignee !== "unassigned" && t.assignee?.name !== assignee) return false;
      return true;
    });
  }, [rows, assignee]);

  const filtersActive =
    query.trim() !== "" || status !== "all" || priority !== "all" || assignee !== "all";

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setPriority("all");
    setAssignee("all");
  }

  const updateM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { status?: string; assignee_id?: string } }) =>
      adminUpdateTicket(id, patch),
    onSuccess: (_res, vars) => {
      void qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
      if (vars.patch.status) {
        toast.success(`Status set to ${vars.patch.status.replace(/_/g, " ")}`, { description: vars.id });
      } else {
        toast.success("Ticket assigned to you", { description: vars.id });
      }
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't update the ticket"),
  });

  function assignToMe(t: AdminTicketRow) {
    if (!user) return;
    updateM.mutate({ id: t.id, patch: { assignee_id: user.id } });
  }

  function changeStatus(t: AdminTicketRow, next: TicketStatus) {
    updateM.mutate({ id: t.id, patch: { status: next } });
  }

  return (
    <QueryBoundary isLoading={listQ.isLoading} error={listQ.error} onRetry={() => void listQ.refetch()}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryChip label="Open" value={openCount} tone="info" testId="tickets-summary-open" />
          <SummaryChip
            label="Unassigned"
            value={unassignedCount}
            tone="warning"
            testId="tickets-summary-unassigned"
          />
          <SummaryChip
            label="Breaching SLA"
            value={breachingCount}
            tone="destructive"
            testId="tickets-summary-sla"
          />
          <SummaryChip label="Urgent" value={urgentCount} tone="destructive" testId="tickets-summary-urgent" />
        </div>

        {/* Filter toolbar */}
        <Card className="p-0">
          <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative w-full lg:max-w-xs">
              <Icon
                name="search"
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search subject, tenant, ID…"
                className="pl-9"
                data-testid="tickets-search-input"
              />
            </div>

            <Select value={status} onValueChange={(v) => setStatus(v as TicketStatus | "all")}>
              <SelectTrigger className="w-full lg:w-[150px]" data-testid="tickets-filter-status-select">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority | "all")}>
              <SelectTrigger className="w-full lg:w-[150px]" data-testid="tickets-filter-priority-select">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {PRIORITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="w-full lg:w-[170px]" data-testid="tickets-filter-assignee-select">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All assignees</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {assignees.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 lg:ml-auto">
              <span className="hidden text-xs text-muted-foreground sm:inline" data-testid="tickets-result-count">
                {filtered.length} of {rows.length}
              </span>
              {filtersActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="group"
                  onClick={clearFilters}
                  data-testid="tickets-clear-filters-btn"
                >
                  <Icon name="filter" trigger="group-hover" size={15} />
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {filtered.length === 0 ? (
          <EmptyState
            icon="ticket"
            title={filtersActive ? "No tickets match these filters" : "Inbox zero"}
            description={
              filtersActive
                ? "Try widening your search or clearing the filters."
                : "No open tickets right now — nothing needs attention."
            }
            testId="tickets-empty-state"
          >
            {filtersActive && (
              <Button variant="outline" onClick={clearFilters} data-testid="tickets-empty-clear-btn">
                Clear filters
              </Button>
            )}
          </EmptyState>
        ) : (
          <>
            {/* Desktop / tablet table */}
            <Card className="hidden overflow-hidden p-0 md:block">
              <div className="overflow-x-auto">
                <Table data-testid="tickets-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Requester</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead>SLA</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((t) => (
                      <TableRow key={t.id} data-testid={`ticket-row-${t.id}`} className="group">
                        <TableCell className="max-w-[280px]">
                          <Link
                            href={`/admin/tickets/${t.id}`}
                            className="flex items-center gap-1.5 font-medium hover:text-primary"
                            data-testid={`ticket-open-${t.id}`}
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
                        <TableCell className="whitespace-nowrap">
                          <span className="text-sm font-medium">
                            {t.requester.company || t.requester.name}
                          </span>
                          <p className="text-xs text-muted-foreground">{t.requester.name}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={t.priority} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={t.status} />
                        </TableCell>
                        <TableCell>
                          {t.assignee ? (
                            <span className="flex items-center gap-2 whitespace-nowrap">
                              <Avatar className="size-6">
                                <AvatarFallback className="text-[10px]">
                                  {initials(t.assignee.name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm">{t.assignee.name}</span>
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.sla.variant}>{t.sla.label}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatRelativeTime(t.updatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <RowActions
                            ticket={t}
                            currentUserId={user?.id ?? null}
                            pending={updateM.isPending}
                            onAssignToMe={() => assignToMe(t)}
                            onChangeStatus={(s) => changeStatus(t, s)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden" data-testid="tickets-card-list">
              {filtered.map((t) => (
                <Card key={t.id} data-testid={`ticket-card-${t.id}`} className="group">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/admin/tickets/${t.id}`}
                        className="font-medium leading-snug hover:text-primary"
                      >
                        {t.subject}
                      </Link>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
                      <StatusBadge status={t.priority} />
                      <Badge variant={t.sla.variant}>{t.sla.label}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-mono">{t.id}</span>
                      <span>Updated {formatRelativeTime(t.updatedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                      <div className="flex items-center gap-2 text-sm">
                        {t.assignee ? (
                          <>
                            <Avatar className="size-6">
                              <AvatarFallback className="text-[10px]">
                                {initials(t.assignee.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate">{t.assignee.name}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </div>
                      <RowActions
                        ticket={t}
                        currentUserId={user?.id ?? null}
                        pending={updateM.isPending}
                        onAssignToMe={() => assignToMe(t)}
                        onChangeStatus={(s) => changeStatus(t, s)}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </QueryBoundary>
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
  tone: "muted" | "info" | "warning" | "success" | "destructive";
  testId: string;
}) {
  const dot: Record<string, string> = {
    muted: "bg-muted-foreground",
    info: "bg-info",
    warning: "bg-warning",
    success: "bg-success",
    destructive: "bg-destructive",
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

function RowActions({
  ticket,
  currentUserId,
  pending,
  onAssignToMe,
  onChangeStatus,
}: {
  ticket: AdminTicketRow;
  currentUserId: string | null;
  pending: boolean;
  onAssignToMe: () => void;
  onChangeStatus: (status: TicketStatus) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="group"
          data-testid={`ticket-actions-${ticket.id}`}
          aria-label={`Actions for ${ticket.subject}`}
        >
          <Icon name="more" trigger="group-hover" size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link href={`/admin/tickets/${ticket.id}`} data-testid={`ticket-action-open-${ticket.id}`}>
            <Icon name="eye" size={15} />
            Open ticket
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onAssignToMe}
          disabled={pending || !currentUserId || ticket.assignee?.id === currentUserId}
          data-testid={`ticket-action-assign-${ticket.id}`}
        >
          <Icon name="users" size={15} />
          Assign to me
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Change status</DropdownMenuLabel>
        {STATUS_OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onSelect={() => onChangeStatus(o.value)}
            disabled={pending || ticket.status === o.value}
            data-testid={`ticket-action-status-${o.value}-${ticket.id}`}
          >
            <Icon name={o.value === "resolved" ? "checkCircle" : "tag"} size={15} />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
