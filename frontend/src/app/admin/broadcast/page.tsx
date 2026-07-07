"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { getBroadcastAudience, sendBroadcast } from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";
import { formatNumber } from "@/lib/format";

export default function BroadcastPage() {
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const audienceQ = useQuery({ queryKey: ["admin", "broadcast", "audience"], queryFn: getBroadcastAudience });
  const recipients = audienceQ.data?.recipients ?? 0;

  const sendM = useMutation({
    mutationFn: () => sendBroadcast({ subject: subject.trim(), body: body.trim() }),
    onSuccess: (r) => {
      setConfirmOpen(false);
      toast.success(`Sent to ${formatNumber(r.sent)} recipient${r.sent === 1 ? "" : "s"}${r.failed ? ` · ${r.failed} failed` : ""}.`);
      setSubject("");
      setBody("");
    },
    onError: (e) => {
      setConfirmOpen(false);
      toast.error(e instanceof ApiError ? e.message : "Couldn't send the broadcast");
    },
  });

  const valid = subject.trim().length >= 3 && body.trim().length >= 10;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content"
        title="Product Updates"
        description="Email an announcement to every user who opted in to product updates. Users who didn't opt in are never contacted."
      >
        <Badge variant="muted" className="tabular-nums" data-testid="broadcast-audience-badge">
          <Icon name="users" size={14} className="mr-1" />
          {formatNumber(recipients)} opted-in
        </Badge>
      </PageHeader>

      <QueryBoundary isLoading={audienceQ.isLoading} error={audienceQ.error} onRetry={() => void audienceQ.refetch()}>
        <Card data-testid="broadcast-compose-card">
          <CardHeader>
            <CardTitle className="text-base">Compose</CardTitle>
            <CardDescription>
              An unsubscribe note is appended automatically. Keep it useful — this reaches real inboxes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="broadcast-subject">Subject</Label>
              <Input
                id="broadcast-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What's new in Postpin this month"
                maxLength={160}
                data-testid="broadcast-subject-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="broadcast-body">Message</Label>
              <Textarea
                id="broadcast-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                placeholder="Write your update…  (plain text — line breaks are preserved)"
                data-testid="broadcast-body-textarea"
              />
              <p className="text-xs text-muted-foreground">{body.trim().length} characters</p>
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger asChild>
                <Button variant="gradient" className="group" disabled={!valid || recipients === 0} data-testid="broadcast-send-btn">
                  <Icon name="send" size={16} className="text-white" />
                  Send to {formatNumber(recipients)}
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="broadcast-confirm-dialog">
                <DialogHeader>
                  <DialogTitle>Send this broadcast?</DialogTitle>
                  <DialogDescription>
                    This emails <strong>“{subject.trim()}”</strong> to{" "}
                    <strong>{formatNumber(recipients)}</strong> opted-in user{recipients === 1 ? "" : "s"}. This can't be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline" data-testid="broadcast-cancel-btn">Cancel</Button>
                  </DialogClose>
                  <Button
                    variant="gradient"
                    onClick={() => sendM.mutate()}
                    disabled={sendM.isPending}
                    data-testid="broadcast-confirm-send-btn"
                  >
                    {sendM.isPending ? "Sending…" : "Send now"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardFooter>
        </Card>
      </QueryBoundary>
    </div>
  );
}
