"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import type { Ticket } from "@/lib/types";

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
  onReply: (body: string) => Promise<void>;
  sending: boolean;
}) {
  const [reply, setReply] = useState("");
  const messages = ticket.messages;
  const resolved = ticket.status === "resolved" || ticket.status === "closed";

  async function send() {
    const body = reply.trim();
    if (!body) {
      toast.error("Write a message before sending.");
      return;
    }
    try {
      await onReply(body);
      setReply("");
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
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="group" data-testid="ticket-attach-reply-btn">
            <Icon name="upload" trigger="group-hover" size={15} />
            Attach
          </Button>
          <Button
            variant="gradient"
            className="group"
            onClick={send}
            disabled={sending || !reply.trim()}
            data-testid="ticket-send-btn"
          >
            <Icon name="send" trigger="group-hover" size={16} className="text-white" />
            {sending ? "Sending…" : "Send reply"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
