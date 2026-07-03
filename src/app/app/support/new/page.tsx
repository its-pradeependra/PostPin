"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { createTicket } from "@/lib/api/services/tickets";
import { ApiError } from "@/lib/api/errors";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { TicketCategory, TicketPriority } from "@/lib/types";

const CATEGORIES: { value: TicketCategory; label: string; description: string; icon: IconName }[] = [
  { value: "billing", label: "Billing", description: "Plans, invoices, payments & overage", icon: "billing" },
  { value: "api", label: "API & integration", description: "Keys, webhooks, errors & SDKs", icon: "code" },
  { value: "pincode-data", label: "Pincode data", description: "Zones, serviceability & rate mapping", icon: "pin" },
  { value: "account", label: "Account", description: "Profile, team, security & access", icon: "profile" },
  { value: "feature-request", label: "Feature request", description: "Ideas to make Postpin better", icon: "sparkles" },
  { value: "other", label: "Other", description: "Anything else we can help with", icon: "help" },
];

const PRIORITIES: { value: TicketPriority; label: string; hint: string }[] = [
  { value: "low", label: "Low", hint: "General question, no rush" },
  { value: "medium", label: "Medium", hint: "Affects work but has a workaround" },
  { value: "high", label: "High", hint: "Significant impact on production" },
  { value: "urgent", label: "Urgent", hint: "Service down or revenue-impacting" },
];

const STEPS = [
  { id: 1, label: "Category", icon: "rateCard" as IconName },
  { id: 2, label: "Details", icon: "edit" as IconName },
  { id: 3, label: "Review", icon: "checkCircle" as IconName },
];

export default function NewTicketPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const [category, setCategory] = useState<TicketCategory | "">("");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

  const categoryMeta = CATEGORIES.find((c) => c.value === category);

  const canNextStep1 = category !== "";
  const canNextStep2 = subject.trim().length >= 4 && description.trim().length >= 10;

  function next() {
    if (step === 1 && !canNextStep1) {
      toast.error("Pick a category to continue.");
      return;
    }
    if (step === 2 && !canNextStep2) {
      toast.error("Add a subject (4+ chars) and a description (10+ chars).");
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  }

  function back() {
    setStep((s) => Math.max(1, s - 1));
  }

  async function submit() {
    if (category === "" || !canNextStep2) {
      toast.error("Complete the ticket details before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const ticket = await createTicket({
        subject: subject.trim(),
        category,
        priority,
        body: description.trim(),
      });
      await qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket created", {
        description: `${ticket.id} — our team will respond shortly.`,
      });
      router.push("/app/support");
    } catch (e) {
      setSubmitting(false);
      toast.error(e instanceof ApiError ? e.message : "Couldn't create the ticket. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Support"
        title="New ticket"
        description="Tell us what's going on and we'll route it to the right team."
      >
        <Button variant="outline" asChild data-testid="ticket-cancel-btn">
          <Link href="/app/support" className="group">
            <Icon name="arrowRight" trigger="group-hover" size={16} className="rotate-180" />
            Back to tickets
          </Link>
        </Button>
      </PageHeader>

      {/* Step indicator */}
      <ol className="flex items-center gap-2" data-testid="ticket-stepper">
        {STEPS.map((s, i) => {
          const done = step > s.id;
          const active = step === s.id;
          return (
            <li key={s.id} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2",
                  active && "border-primary bg-brand-gradient-soft text-primary",
                  done && "border-success/40 bg-success/12 text-success",
                  !active && !done && "border-border text-muted-foreground",
                )}
                data-testid={`ticket-step-${s.id}`}
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-xs font-semibold",
                    active && "bg-primary text-primary-foreground",
                    done && "bg-success text-success-foreground",
                    !active && !done && "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Icon name="check" size={14} /> : s.id}
                </span>
                <span className="hidden text-sm font-medium sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <span
                  className={cn(
                    "hidden h-px flex-1 sm:block",
                    step > s.id ? "bg-success" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      <Card>
        {/* Step 1 — Category & priority */}
        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle>What do you need help with?</CardTitle>
              <CardDescription>Choose the area closest to your issue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup
                value={category}
                onValueChange={(v) => setCategory(v as TicketCategory)}
                className="grid gap-3 sm:grid-cols-2"
                data-testid="ticket-category-select"
              >
                {CATEGORIES.map((c) => (
                  <label
                    key={c.value}
                    htmlFor={`cat-${c.value}`}
                    data-testid={`ticket-category-${c.value}-option`}
                    className={cn(
                      "group flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                      category === c.value
                        ? "border-primary bg-brand-gradient-soft"
                        : "border-border hover:border-primary/40 hover:bg-accent",
                    )}
                  >
                    <RadioGroupItem value={c.value} id={`cat-${c.value}`} className="mt-0.5" />
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-gradient-soft text-primary">
                      <Icon name={c.icon} trigger="group-hover" size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{c.label}</span>
                      <span className="block text-xs text-muted-foreground">{c.description}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>

              <div className="max-w-sm space-y-2">
                <Label htmlFor="ticket-priority">Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                  <SelectTrigger id="ticket-priority" data-testid="ticket-priority-select">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <span className="flex flex-col">
                          <span className="capitalize">{p.label}</span>
                          <span className="text-xs text-muted-foreground">{p.hint}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </>
        )}

        {/* Step 2 — Details */}
        {step === 2 && (
          <>
            <CardHeader>
              <CardTitle>Describe your issue</CardTitle>
              <CardDescription>
                The more detail you share, the faster we can help.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="ticket-subject">Subject</Label>
                <Input
                  id="ticket-subject"
                  data-testid="ticket-subject-input"
                  placeholder="e.g. Rate mismatch for 190001 (Srinagar) shipments"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={120}
                />
                <p className="text-xs text-muted-foreground">{subject.length}/120 characters</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ticket-description">Description</Label>
                <Textarea
                  id="ticket-description"
                  data-testid="ticket-description-input"
                  rows={7}
                  placeholder="What happened? Include pincodes, request IDs, key prefixes or steps to reproduce."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ticket-attach">Attachments (optional)</Label>
                <label
                  htmlFor="ticket-attach"
                  className="group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/40 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-accent"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                    <Icon name="upload" trigger="group-hover" size={20} />
                  </span>
                  <span className="text-sm font-medium">Click to upload a screenshot or log</span>
                  <span className="text-xs text-muted-foreground">PNG, JPG, PDF or LOG up to 10 MB</span>
                  <input
                    id="ticket-attach"
                    type="file"
                    className="sr-only"
                    data-testid="ticket-attach-input"
                    onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                  />
                </label>
                {fileName && (
                  <div
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
                    data-testid="ticket-attach-chip"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Icon name="invoice" size={16} className="text-muted-foreground" />
                      <span className="truncate">{fileName}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="group size-7"
                      onClick={() => setFileName(null)}
                      data-testid="ticket-attach-remove-btn"
                      aria-label="Remove attachment"
                    >
                      <Icon name="close" trigger="group-hover" size={15} />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </>
        )}

        {/* Step 3 — Review */}
        {step === 3 && (
          <>
            <CardHeader>
              <CardTitle>Review & submit</CardTitle>
              <CardDescription>Confirm the details before we create your ticket.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5" data-testid="ticket-review">
              <dl className="grid gap-4 sm:grid-cols-2">
                <ReviewItem label="Category">
                  {categoryMeta ? (
                    <span className="flex items-center gap-2">
                      <Icon name={categoryMeta.icon} size={16} className="text-primary" />
                      {categoryMeta.label}
                    </span>
                  ) : (
                    "—"
                  )}
                </ReviewItem>
                <ReviewItem label="Priority">
                  <Badge
                    variant={
                      priority === "urgent"
                        ? "destructive"
                        : priority === "high"
                          ? "warning"
                          : priority === "medium"
                            ? "info"
                            : "muted"
                    }
                    className="capitalize"
                  >
                    {priority}
                  </Badge>
                </ReviewItem>
              </dl>
              <div className="space-y-1.5">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Subject
                </dt>
                <dd className="font-medium">{subject || "—"}</dd>
              </div>
              <div className="space-y-1.5">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Description
                </dt>
                <dd className="whitespace-pre-wrap rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  {description || "—"}
                </dd>
              </div>
              {fileName && (
                <div className="space-y-1.5">
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Attachment
                  </dt>
                  <dd className="flex items-center gap-2 text-sm">
                    <Icon name="invoice" size={16} className="text-muted-foreground" />
                    {fileName}
                  </dd>
                </div>
              )}
            </CardContent>
          </>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border p-6">
          <Button
            variant="ghost"
            onClick={back}
            disabled={step === 1 || submitting}
            className="group"
            data-testid="ticket-back-btn"
          >
            <Icon name="arrowRight" trigger="group-hover" size={16} className="rotate-180" />
            Back
          </Button>
          {step < 3 ? (
            <Button
              variant="gradient"
              onClick={next}
              className="group"
              data-testid="ticket-next-btn"
            >
              Next
              <Icon name="arrowRight" trigger="group-hover" size={16} className="text-white" />
            </Button>
          ) : (
            <Button
              variant="gradient"
              onClick={submit}
              disabled={submitting}
              className="group"
              data-testid="ticket-submit-btn"
            >
              <Icon name="send" trigger="group-hover" size={16} className="text-white" />
              {submitting ? "Submitting…" : "Submit ticket"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function ReviewItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}
