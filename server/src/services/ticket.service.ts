import { Types } from "mongoose";
import { getContext } from "@/context/request-context.js";
import { AppError } from "@/lib/errors.js";
import { CompanyModel, TicketModel, TicketReplyModel, UserModel } from "@/models/index.js";
import { scopedRepo } from "@/tenancy/scoped-repo.js";
import { writeAudit } from "@/services/audit.service.js";
import { createNotification } from "@/services/notification.service.js";

export type TicketCategory = "billing" | "api" | "pincode-data" | "account" | "feature-request" | "other";
export type TicketPriority = "low" | "medium" | "high" | "urgent";
export type TicketStatus = "open" | "pending" | "on_hold" | "resolved" | "closed";

const REOPENABLE: TicketStatus[] = ["resolved", "closed"];

interface UserLite {
  name: string;
  email: string;
}

async function resolveUsers(ids: Array<Types.ObjectId | null | undefined>): Promise<Map<string, UserLite>> {
  const uniq = [...new Set(ids.filter(Boolean).map((id) => String(id)))];
  if (uniq.length === 0) return new Map();
  const users = (await UserModel.find({ _id: { $in: uniq } })
    .select("name email")
    .lean()) as Array<{ _id: Types.ObjectId; name: string; email: string }>;
  return new Map(users.map((u) => [String(u._id), { name: u.name, email: u.email }]));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ticketDto(t: any, users: Map<string, UserLite>, companyName: string | undefined, messages: unknown[] = []) {
  const requester = users.get(String(t.requesterId));
  const assignee = t.assigneeId ? users.get(String(t.assigneeId)) : null;
  return {
    id: t.ticketNumber,
    subject: t.subject,
    category: t.category as TicketCategory,
    priority: t.priority as TicketPriority,
    status: t.status as TicketStatus,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    requester: {
      name: requester?.name ?? "Unknown",
      email: requester?.email ?? "",
      company: companyName,
    },
    assignee: assignee?.name ?? null,
    messages,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function messageDto(r: any, users: Map<string, UserLite>) {
  return {
    id: String(r._id),
    author: users.get(String(r.authorId))?.name ?? "Support",
    authorRole: r.authorRole === "requester" ? ("customer" as const) : ("agent" as const),
    body: r.body,
    createdAt: r.createdAt,
    attachments: (r.attachments ?? []) as TicketAttachment[],
  };
}

async function companyName(companyId: Types.ObjectId | null): Promise<string | undefined> {
  if (!companyId) return undefined;
  const c = (await CompanyModel.findById(companyId).select("name").lean()) as { name?: string } | null;
  return c?.name;
}

export async function listTickets(status?: TicketStatus) {
  const { companyId } = getContext();
  const filter: Record<string, unknown> = { isDeleted: false };
  if (status) filter.status = status;
  const rows = await scopedRepo(TicketModel).find(filter).sort({ updatedAt: -1 }).lean();
  const users = await resolveUsers(rows.flatMap((t) => [t.requesterId, t.assigneeId]));
  const cName = await companyName(companyId);
  return rows.map((t) => ticketDto(t, users, cName));
}

export async function getTicket(ticketNumber: string) {
  const { companyId } = getContext();
  const t = (await scopedRepo(TicketModel).findOne({ ticketNumber, isDeleted: false }).lean()) as
    | Record<string, unknown>
    | null;
  if (!t) throw AppError.notFound("Ticket not found");

  const replies = (await scopedRepo(TicketReplyModel)
    .find({ ticketId: t._id, isInternal: false, isDeleted: false })
    .sort({ createdAt: 1 })
    .lean()) as Array<Record<string, unknown>>;

  const users = await resolveUsers([
    t.requesterId as Types.ObjectId,
    t.assigneeId as Types.ObjectId,
    ...replies.map((r) => r.authorId as Types.ObjectId),
  ]);
  const cName = await companyName(companyId);
  const requesterName = users.get(String(t.requesterId))?.name ?? "You";

  // The ticket body is the first (root) message; replies follow chronologically.
  const rootMessage = {
    id: `${t.ticketNumber as string}-root`,
    author: requesterName,
    authorRole: "customer" as const,
    body: t.body as string,
    createdAt: t.createdAt,
    attachments: (t.attachments ?? []) as TicketAttachment[],
  };
  const messages = [rootMessage, ...replies.map((r) => messageDto(r, users))];
  return ticketDto(t, users, cName, messages);
}

function makeTicketNumber(): string {
  const year = new Date().getFullYear();
  const n = Math.floor(100000 + Math.random() * 900000);
  return `PP-${year}-${n}`;
}

export interface TicketAttachment {
  url: string;
  name: string;
  mimetype: string;
  size: number;
}

export async function createTicket(input: {
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  body: string;
  attachments?: TicketAttachment[];
}) {
  const ctx = getContext();
  let created: unknown = null;
  // ticketNumber is globally unique — retry on the rare collision.
  for (let attempt = 0; attempt < 6 && !created; attempt++) {
    try {
      created = await scopedRepo(TicketModel).create({
        ticketNumber: makeTicketNumber(),
        requesterId: ctx.userId,
        subject: input.subject,
        body: input.body,
        category: input.category,
        priority: input.priority,
        status: "open",
        channel: "portal",
        attachments: input.attachments ?? [],
      });
    } catch (e) {
      const err = e as { code?: number };
      if (err.code !== 11000 || attempt === 5) throw e;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = created as any;
  await writeAudit({
    action: "ticket.created",
    category: "support",
    resource: { kind: "ticket", id: String(doc._id), name: doc.ticketNumber },
  });
  await createNotification({
    recipientId: ctx.userId,
    kind: "ticket",
    type: "ticket.created",
    title: `Ticket ${doc.ticketNumber} received`,
    body: "Thanks — our support team will get back to you shortly.",
    actionUrl: `/app/support/${doc.ticketNumber}`,
  });
  const users = await resolveUsers([doc.requesterId]);
  const cName = await companyName(ctx.companyId);
  return { ticket: ticketDto(doc, users, cName) };
}

export async function replyToTicket(ticketNumber: string, body: string, attachments: TicketAttachment[] = []) {
  const ctx = getContext();
  const ticket = await scopedRepo(TicketModel).findOne({ ticketNumber, isDeleted: false });
  if (!ticket) throw AppError.notFound("Ticket not found");

  const reply = await scopedRepo(TicketReplyModel).create({
    ticketId: ticket._id,
    authorId: ctx.userId,
    authorRole: "requester",
    body,
    isInternal: false,
    attachments,
  });

  const reopened = REOPENABLE.includes(ticket.status as TicketStatus);
  ticket.replyCount = (ticket.replyCount ?? 0) + 1;
  ticket.lastReplyAt = new Date();
  ticket.lastReplyBy = ctx.userId;
  if (reopened) {
    ticket.status = "open";
    ticket.reopenCount = (ticket.reopenCount ?? 0) + 1;
  }
  await ticket.save();

  await writeAudit({
    action: reopened ? "ticket.reopened" : "ticket.replied",
    category: "support",
    resource: { kind: "ticket", id: String(ticket._id), name: ticketNumber },
  });

  const users = await resolveUsers([ctx.userId]);
  return { message: messageDto(reply, users), reopened };
}

// ═══ Admin (platform, cross-tenant — gated ticket:write at the route) ════════

/** MVP SLA policy: first response 1h; resolution by priority. */
const SLA_HOURS: Record<TicketPriority, number> = { urgent: 4, high: 8, medium: 24, low: 72 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function slaStatus(t: any): { label: string; variant: "success" | "warning" | "destructive" | "muted"; breached: boolean } {
  if (t.status === "resolved" || t.status === "closed") return { label: "Met", variant: "success", breached: false };
  const dueMs = new Date(t.createdAt).getTime() + SLA_HOURS[(t.priority as TicketPriority) ?? "medium"] * 3_600_000;
  const leftMs = dueMs - Date.now();
  if (leftMs < 0) {
    const overH = Math.ceil(-leftMs / 3_600_000);
    return { label: `Breached +${overH}h`, variant: "destructive", breached: true };
  }
  if (leftMs < 3_600_000) return { label: `${Math.max(1, Math.round(leftMs / 60_000))}m left`, variant: "warning", breached: false };
  return { label: "On track", variant: "muted", breached: false };
}

async function companyNames(ids: Array<Types.ObjectId | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean).map((id) => String(id)))];
  if (uniq.length === 0) return new Map();
  const rows = (await CompanyModel.find({ _id: { $in: uniq } }).select("name").lean()) as Array<{ _id: Types.ObjectId; name: string }>;
  return new Map(rows.map((c) => [String(c._id), c.name]));
}

export async function adminListTickets(params: { status?: TicketStatus; priority?: TicketPriority; q?: string; limit?: number }) {
  const filter: Record<string, unknown> = { isDeleted: false };
  if (params.status) filter.status = params.status;
  if (params.priority) filter.priority = params.priority;
  if (params.q) {
    const rx = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ subject: rx }, { ticketNumber: rx }];
  }
  const rows = await TicketModel.find(filter).sort({ updatedAt: -1 }).limit(Math.min(params.limit ?? 100, 200)).lean();
  const users = await resolveUsers(rows.flatMap((t) => [t.requesterId, t.assigneeId]));
  const companies = await companyNames(rows.map((t) => t.companyId));
  return rows.map((t) => ({
    id: t.ticketNumber,
    subject: t.subject,
    category: t.category as TicketCategory,
    priority: t.priority as TicketPriority,
    status: t.status as TicketStatus,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    requester: {
      name: users.get(String(t.requesterId))?.name ?? "Unknown",
      email: users.get(String(t.requesterId))?.email ?? "",
      company: companies.get(String(t.companyId)) ?? "—",
    },
    assignee: t.assigneeId ? { id: String(t.assigneeId), name: users.get(String(t.assigneeId))?.name ?? "Agent" } : null,
    replyCount: t.replyCount ?? 0,
    sla: slaStatus(t),
  }));
}

export async function adminGetTicket(ticketNumber: string) {
  const t = (await TicketModel.findOne({ ticketNumber, isDeleted: false }).lean()) as Record<string, unknown> | null;
  if (!t) throw AppError.notFound("Ticket not found");
  // Admin sees the FULL thread, internal notes included.
  const replies = (await TicketReplyModel.find({ ticketId: t._id, isDeleted: false }).sort({ createdAt: 1 }).lean()) as Array<
    Record<string, unknown>
  >;
  const users = await resolveUsers([
    t.requesterId as Types.ObjectId,
    t.assigneeId as Types.ObjectId,
    ...replies.map((r) => r.authorId as Types.ObjectId),
  ]);
  const companies = await companyNames([t.companyId as Types.ObjectId]);
  const requesterName = users.get(String(t.requesterId))?.name ?? "Customer";

  const messages = [
    {
      id: `${t.ticketNumber as string}-root`,
      author: requesterName,
      authorRole: "customer" as const,
      body: t.body as string,
      createdAt: t.createdAt,
      internal: false,
    },
    ...replies
      .filter((r) => !(r.statusChange as { from?: string } | undefined)?.from) // status-change markers are not chat messages
      .map((r) => ({
        id: String(r._id),
        author: users.get(String(r.authorId))?.name ?? (r.authorRole === "requester" ? requesterName : "Support"),
        authorRole: r.authorRole === "requester" ? ("customer" as const) : ("agent" as const),
        body: r.body as string,
        createdAt: r.createdAt,
        internal: Boolean(r.isInternal),
      })),
  ];

  return {
    id: t.ticketNumber,
    subject: t.subject,
    category: t.category as TicketCategory,
    priority: t.priority as TicketPriority,
    status: t.status as TicketStatus,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    requester: {
      name: requesterName,
      email: users.get(String(t.requesterId))?.email ?? "",
      company: companies.get(String(t.companyId)) ?? "—",
    },
    assignee: t.assigneeId ? { id: String(t.assigneeId), name: users.get(String(t.assigneeId))?.name ?? "Agent" } : null,
    sla: slaStatus(t),
    messages,
  };
}

export async function adminReply(ticketNumber: string, input: { body: string; isInternal: boolean }) {
  const ctx = getContext();
  const ticket = await TicketModel.findOne({ ticketNumber, isDeleted: false });
  if (!ticket) throw AppError.notFound("Ticket not found");

  const reply = await TicketReplyModel.create({
    ticketId: ticket._id,
    companyId: ticket.companyId,
    authorId: ctx.userId,
    authorRole: "agent",
    body: input.body,
    isInternal: input.isInternal,
  });

  if (!input.isInternal) {
    ticket.replyCount = (ticket.replyCount ?? 0) + 1;
    ticket.lastReplyAt = new Date();
    ticket.lastReplyBy = ctx.userId;
    if (!ticket.sla?.firstRespondedAt) ticket.set("sla.firstRespondedAt", new Date());
    if (ticket.status === "open") ticket.status = "pending"; // waiting on the customer
    await ticket.save();
    await createNotification({
      recipientId: ticket.requesterId,
      companyId: ticket.companyId,
      kind: "ticket",
      type: "ticket.agent_replied",
      title: `Support replied on ${ticket.ticketNumber}`,
      body: input.body.slice(0, 140),
      actionUrl: `/app/support/${ticket.ticketNumber}`,
    });
  }

  await writeAudit({
    action: input.isInternal ? "ticket.internal_note" : "ticket.agent_replied",
    category: "support",
    resource: { kind: "ticket", id: String(ticket._id), name: ticket.ticketNumber },
  });

  const users = await resolveUsers([ctx.userId]);
  return {
    message: {
      id: String(reply._id),
      author: users.get(String(ctx.userId))?.name ?? "Support",
      authorRole: "agent" as const,
      body: reply.body,
      createdAt: reply.createdAt,
      internal: Boolean(reply.isInternal),
    },
  };
}

export async function adminUpdateTicket(
  ticketNumber: string,
  patch: { status?: TicketStatus; priority?: TicketPriority; assigneeId?: string | null },
) {
  const ctx = getContext();
  const ticket = await TicketModel.findOne({ ticketNumber, isDeleted: false });
  if (!ticket) throw AppError.notFound("Ticket not found");

  const changes: Array<{ field: string; before?: unknown; after?: unknown }> = [];
  if (patch.status && patch.status !== ticket.status) {
    changes.push({ field: "status", before: ticket.status, after: patch.status });
    // Status transitions leave a system marker in the thread (not a chat message).
    await TicketReplyModel.create({
      ticketId: ticket._id,
      companyId: ticket.companyId,
      authorId: ctx.userId,
      authorRole: "system",
      body: `Status changed from ${ticket.status} to ${patch.status}`,
      isInternal: true,
      statusChange: { from: ticket.status, to: patch.status },
    });
    if (patch.status === "resolved" || patch.status === "closed") {
      ticket.closedAt = new Date();
      await createNotification({
        recipientId: ticket.requesterId,
        companyId: ticket.companyId,
        kind: "ticket",
        type: "ticket.resolved",
        severity: "success",
        title: `Ticket ${ticket.ticketNumber} ${patch.status}`,
        body: "Reply on the ticket if you still need help — it will reopen automatically.",
        actionUrl: `/app/support/${ticket.ticketNumber}`,
      });
    }
    ticket.status = patch.status;
  }
  if (patch.priority && patch.priority !== ticket.priority) {
    changes.push({ field: "priority", before: ticket.priority, after: patch.priority });
    ticket.priority = patch.priority;
  }
  if (patch.assigneeId !== undefined) {
    let next: Types.ObjectId | null = null;
    if (patch.assigneeId) {
      // Only active platform staff can hold ticket assignments.
      const staff = await UserModel.findOne({ _id: patch.assigneeId, isPlatformStaff: true, status: "active" })
        .select("_id")
        .lean();
      if (!staff) throw AppError.badRequest("Assignee must be an active platform staff member", "invalid_assignee");
      next = staff._id as Types.ObjectId;
    }
    changes.push({ field: "assignee", before: String(ticket.assigneeId ?? ""), after: String(next ?? "") });
    ticket.assigneeId = next;
  }
  if (changes.length === 0) return adminGetTicket(ticketNumber);
  await ticket.save();

  await writeAudit({
    action: "ticket.updated",
    category: "support",
    resource: { kind: "ticket", id: String(ticket._id), name: ticket.ticketNumber },
    changes,
  });
  return adminGetTicket(ticketNumber);
}
