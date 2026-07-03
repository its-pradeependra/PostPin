import { apiFetch } from "@/lib/api/client";
import type { Ticket, TicketCategory, TicketPriority, TicketStatus, TicketMessage } from "@/lib/types";

export type { Ticket, TicketMessage };

export function listTickets(status?: TicketStatus | "all"): Promise<Ticket[]> {
  const qs = status && status !== "all" ? `?status=${status}` : "";
  return apiFetch<{ tickets: Ticket[] }>(`/tickets${qs}`).then((r) => r.tickets);
}

export function getTicket(id: string): Promise<Ticket> {
  return apiFetch<{ ticket: Ticket }>(`/tickets/${encodeURIComponent(id)}`).then((r) => r.ticket);
}

export function createTicket(input: {
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  body: string;
}): Promise<Ticket> {
  return apiFetch<{ ticket: Ticket }>("/tickets", { method: "POST", body: input }).then((r) => r.ticket);
}

export function replyToTicket(id: string, body: string): Promise<{ message: TicketMessage; reopened: boolean }> {
  return apiFetch<{ message: TicketMessage; reopened: boolean }>(`/tickets/${encodeURIComponent(id)}/replies`, {
    method: "POST",
    body: { body },
  });
}
