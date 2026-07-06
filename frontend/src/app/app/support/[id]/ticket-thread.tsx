"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import { uploadTicketAttachment } from "@/lib/api/services/tickets";
import { ApiError } from "@/lib/api/errors";
import type { Ticket, TicketAttachment } from "@/lib/types";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TicketThread({
  ticket,
  onReply,
  sending,
}: {
  ticket: Ticket;
  onReply: (body: string, attachments: TicketAttachment[]) => Promise<void>;
  sending: boolean;
}) {
  const [reply, setReply] = useState("");
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const messages = ticket.messages;
  const resolved = ticket.status === "resolved" || ticket.status === "closed";

  async function onAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) {
      toast.error(`"${file.name}" is over the 5 MB limit.`);
      return;
    }
    setUploading(true);
    try {
      const att = await uploadTicketAttachment(file);
      setAttachments((a) => [...a, att]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't upload that file.");
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    const body = reply.trim();
    if (!body) {
      toast.error("Write a message before sending.");
      return;
    }
    try {
      await onReply(body, attachments);
      setReply("");
      setAttachments([]);
    } catch {
      // error toast is surfaced by the mutation's onError
    }
  }

  return (
    <Card className="flex h-full flex-col" data-testid="ticket-thread">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Conversation</CardTitle>
        <Badge variant="muted">
          {messages.length} message{messages.length === 1 ? "" : "s"}
        </Badge>
      </CardHeader>

      <CardContent className="flex-1 space-y-5">
        {messages.map((m) => {
          const isAgent = m.authorRole === "agent";
          return (
            <div
              key={m.id}
              data-testid={`ticket-message-${m.id}`}
              className={cn("flex gap-3", isAgent ? "justify-start" : "flex-row-reverse")}
            >
              <Avatar className="size-8 shrink-0">
                <AvatarFallback
                  className={cn("text-[11px]", isAgent && "bg-secondary text-secondary-foreground")}
                >
                  {initials(m.author)}
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  "min-w-0 max-w-[85%] space-y-1.5",
                  isAgent ? "items-start" : "items-end text-right",
                )}
              >
                <div className={cn("flex items-center gap-2", isAgent ? "justify-start" : "flex-row-reverse")}>
                  <span className="text-sm font-semibold">{m.author}</span>
                  <Badge variant={isAgent ? "info" : "gradient"} className="h-5 px-1.5 text-[10px]">
                    {isAgent ? "Support" : "You"}
                  </Badge>
                </div>
                <div
                  className={cn(
                    "rounded-2xl border px-4 py-2.5 text-sm leading-relaxed text-left",
                    isAgent ? "border-border bg-secondary" : "border-primary/20 bg-brand-gradient-soft",
                  )}
                >
                  {m.body}
                </div>
                {(m.attachments ?? []).length > 0 && (
                  <div className={cn("flex flex-wrap gap-1.5", isAgent ? "justify-start" : "justify-end")}>
                    {(m.attachments ?? []).map((att) => (
                      <a
                        key={att.url}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:text-primary"
                        data-testid={`ticket-message-attachment-${m.id}`}
                      >
                        <Icon name="invoice" size={13} className="text-muted-foreground" />
                        <span className="max-w-[160px] truncate">{att.name}</span>
                      </a>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{formatRelativeTime(m.createdAt)}</p>
              </div>
            </div>
          );
        })}
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-3 border-t border-border pt-6">
        {resolved && (
          <p className="flex items-center gap-2 rounded-lg bg-success/12 px-3 py-2 text-xs text-success">
            <Icon name="checkCircle" size={14} />
            This ticket is {ticket.status}. Replying will reopen the conversation.
          </p>
        )}
        <Textarea
          rows={3}
          placeholder="Write a reply…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          data-testid="ticket-reply-input"
        />
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid="ticket-reply-attachments">
            {attachments.map((att) => (
              <span
                key={att.url}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs"
              >
                <Icon name="invoice" size={13} className="text-muted-foreground" />
                <span className="max-w-[140px] truncate">{att.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((a) => a.filter((x) => x.url !== att.url))}
                  aria-label={`Remove ${att.name}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Icon name="close" size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv"
            className="hidden"
            onChange={onAttach}
            data-testid="ticket-reply-attach-input"
          />
          <Button
            variant="ghost"
            size="sm"
            className="group"
            disabled={uploading || attachments.length >= 5}
            onClick={() => fileRef.current?.click()}
            data-testid="ticket-attach-reply-btn"
          >
            <Icon name="upload" size={15} />
            {uploading ? "Uploading…" : "Attach"}
          </Button>
          <Button
            variant="gradient"
            className="group"
            onClick={send}
            disabled={sending || !reply.trim()}
            data-testid="ticket-send-btn"
          >
            <Icon name="send" size={16} className="text-white" />
            {sending ? "Sending…" : "Send reply"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
