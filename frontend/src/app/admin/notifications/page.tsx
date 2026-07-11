"use client";

import { siteHost } from "@/lib/site";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon, type IconName } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@/components/ui/card";

import {
  getNotificationConfig,
  listAdminAuditLogs,
  sendTestNotification,
  updateNotificationConfig,
  type AdminAuditLog,
  type AlertSeverity,
  type NotificationConfig,
} from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";
import { formatRelativeTime, formatDateTime } from "@/lib/format";

const SEVERITIES: AlertSeverity[] = ["info", "notice", "warning", "critical"];
const EVENT_LABELS: Record<string, string> = {
  "pincode.sync.failed": "India Post sync failure",
  "billing.payment.failed": "Payment / dunning failure",
  "security.alert": "Security alert",
};

/** Tone map for the two alert severities this feed surfaces. */
const ALERT_META: Record<
  "warning" | "critical",
  {
    label: string;
    icon: IconName;
    badge: React.ComponentProps<typeof Badge>["variant"];
    iconClass: string;
  }
> = {
  warning: {
    label: "Warning",
    icon: "shield",
    badge: "warning",
    iconClass: "bg-warning/12 text-warning",
  },
  critical: {
    label: "Critical",
    icon: "zap",
    badge: "destructive",
    iconClass: "bg-destructive/12 text-destructive",
  },
};

function AlertItem({ log }: { log: AdminAuditLog }) {
  const meta = ALERT_META[log.severity === "critical" ? "critical" : "warning"];
  return (
    <li className="flex items-start gap-3 px-6 py-4" data-testid={`notif-alert-item-${log.id}`}>
      <span
        className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ${meta.iconClass}`}
        aria-hidden
      >
        <Icon name={meta.icon} size={16} />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {log.action}
          </code>
          <Badge variant={meta.badge} data-testid={`notif-alert-severity-${log.id}`}>
            <span className="size-1.5 rounded-full bg-current" />
            {meta.label}
          </Badge>
        </div>
        <p className="truncate text-sm text-foreground">{log.target}</p>
        <p className="text-xs text-muted-foreground">
          {log.actor === "system" ? "System" : log.actor}
          {" · "}
          <span title={formatDateTime(log.at)}>{formatRelativeTime(log.at)}</span>
        </p>
      </div>
    </li>
  );
}

function SeveritySelect({
  value,
  onChange,
  testId,
}: {
  value: AlertSeverity;
  onChange: (v: AlertSeverity) => void;
  testId: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AlertSeverity)}>
      <SelectTrigger className="w-full" data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SEVERITIES.map((s) => (
          <SelectItem key={s} value={s} className="capitalize">
            {s} and above
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ChannelsConfigCard() {
  const qc = useQueryClient();
  const cfgQ = useQuery({ queryKey: ["admin", "notif-config"], queryFn: getNotificationConfig });

  const [draft, setDraft] = React.useState<NotificationConfig | null>(null);
  const [recipientsText, setRecipientsText] = React.useState("");

  // Sync local draft when the server config loads/changes.
  React.useEffect(() => {
    if (cfgQ.data) {
      setDraft(cfgQ.data);
      setRecipientsText(cfgQ.data.email.recipients.join(", "));
    }
  }, [cfgQ.data]);

  const saveM = useMutation({
    mutationFn: (cfg: NotificationConfig) =>
      updateNotificationConfig({
        email: { ...cfg.email, recipients: parseRecipients(recipientsText) },
        slack: cfg.slack,
        events: cfg.events,
      }),
    onSuccess: (cfg) => {
      qc.setQueryData(["admin", "notif-config"], cfg);
      toast.success("Notification channels saved.");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save channels"),
  });

  const testM = useMutation({
    mutationFn: sendTestNotification,
    onSuccess: (r) => {
      const sent = [r.email && "email", r.slack && "Slack"].filter(Boolean);
      if (sent.length) toast.success(`Test alert sent via ${sent.join(" + ")}.`);
      else
        toast.error(
          `No channel delivered the test${r.skipped.length ? ` (${r.skipped.join(", ")})` : ""}. Enable a channel and save first.`,
        );
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't send the test alert"),
  });

  function parseRecipients(text: string): string[] {
    return text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const setEmail = (patch: Partial<NotificationConfig["email"]>) =>
    setDraft((d) => (d ? { ...d, email: { ...d.email, ...patch } } : d));
  const setSlack = (patch: Partial<NotificationConfig["slack"]>) =>
    setDraft((d) => (d ? { ...d, slack: { ...d.slack, ...patch } } : d));
  const setEvent = (key: string, on: boolean) =>
    setDraft((d) => (d ? { ...d, events: { ...d.events, [key]: on } } : d));

  return (
    <Card data-testid="notif-config-card">
      <CardHeader>
        <CardTitle className="text-base">Delivery channels</CardTitle>
        <CardDescription>
          Route critical platform events (sync failures, dunning, security) to email and Slack.
          Secrets stay server-side; only the webhook URL is stored here.
        </CardDescription>
        <CardAction>
          <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
            <Icon name="send" size={18} />
          </span>
        </CardAction>
      </CardHeader>

      <QueryBoundary isLoading={cfgQ.isLoading} error={cfgQ.error} onRetry={() => void cfgQ.refetch()}>
        {draft && (
          <>
            <CardContent className="space-y-6">
              {/* Email channel */}
              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Icon name="mail" size={16} className="text-primary" />
                    <span className="font-medium">Email</span>
                  </div>
                  <Switch
                    checked={draft.email.enabled}
                    onCheckedChange={(v) => setEmail({ enabled: v })}
                    data-testid="notif-email-enabled-switch"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notif-email-recipients">Recipients</Label>
                  <Textarea
                    id="notif-email-recipients"
                    value={recipientsText}
                    onChange={(e) => setRecipientsText(e.target.value)}
                    rows={2}
                    placeholder={`ops@${siteHost}, oncall@${siteHost}`}
                    className="font-mono text-xs"
                    data-testid="notif-email-recipients-input"
                  />
                  <p className="text-xs text-muted-foreground">Comma or newline separated.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Minimum severity</Label>
                  <SeveritySelect
                    value={draft.email.minSeverity}
                    onChange={(v) => setEmail({ minSeverity: v })}
                    testId="notif-email-severity-trigger"
                  />
                </div>
              </div>

              {/* Slack channel */}
              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Icon name="zap" size={16} className="text-primary" />
                    <span className="font-medium">Slack</span>
                  </div>
                  <Switch
                    checked={draft.slack.enabled}
                    onCheckedChange={(v) => setSlack({ enabled: v })}
                    data-testid="notif-slack-enabled-switch"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notif-slack-webhook">Incoming webhook URL</Label>
                  <Input
                    id="notif-slack-webhook"
                    value={draft.slack.webhookUrl}
                    onChange={(e) => setSlack({ webhookUrl: e.target.value })}
                    placeholder="https://hooks.slack.com/services/…"
                    className="font-mono text-xs"
                    data-testid="notif-slack-webhook-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Minimum severity</Label>
                  <SeveritySelect
                    value={draft.slack.minSeverity}
                    onChange={(v) => setSlack({ minSeverity: v })}
                    testId="notif-slack-severity-trigger"
                  />
                </div>
              </div>

              {/* Event toggles */}
              <div className="space-y-3">
                <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Events
                </p>
                <div className="space-y-2">
                  {Object.keys(draft.events).map((key) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-2.5"
                    >
                      <Label htmlFor={`notif-event-${key}`} className="cursor-pointer">
                        {EVENT_LABELS[key] ?? key}
                      </Label>
                      <Switch
                        id={`notif-event-${key}`}
                        checked={draft.events[key] !== false}
                        onCheckedChange={(v) => setEvent(key, v)}
                        data-testid={`notif-event-${key.replace(/\./g, "-")}-switch`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="outline"
                className="group"
                onClick={() => testM.mutate()}
                disabled={testM.isPending}
                data-testid="notif-test-btn"
              >
                <Icon name="send" size={15} />
                {testM.isPending ? "Sending…" : "Send test alert"}
              </Button>
              <Button
                variant="gradient"
                className="group"
                onClick={() => draft && saveM.mutate(draft)}
                disabled={saveM.isPending}
                data-testid="notif-config-save-btn"
              >
                <Icon name="check" size={16} className="text-white" />
                {saveM.isPending ? "Saving…" : "Save channels"}
              </Button>
            </CardFooter>
          </>
        )}
      </QueryBoundary>
    </Card>
  );
}

export default function NotificationCenterPage() {
  const warningQ = useQuery({
    queryKey: ["admin", "alerts", "warning"],
    queryFn: () => listAdminAuditLogs({ severity: "warning", limit: 25 }),
  });
  const criticalQ = useQuery({
    queryKey: ["admin", "alerts", "critical"],
    queryFn: () => listAdminAuditLogs({ severity: "critical", limit: 25 }),
  });

  const alerts = React.useMemo(() => {
    const merged = [...(warningQ.data?.logs ?? []), ...(criticalQ.data?.logs ?? [])];
    return merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [warningQ.data, criticalQ.data]);

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Center"
        description="A live feed of warning and critical platform events, sourced straight from the audit trail."
        eyebrow="Platform"
      >
        <Button variant="outline" className="group" asChild data-testid="notif-header-auditlogs-link">
          <Link href="/admin/audit-logs">
            <Icon name="audit" size={16} />
            View audit logs
          </Link>
        </Button>
      </PageHeader>

      {/* Delivery channels — email + Slack platform alerts */}
      <ChannelsConfigCard />

      {/* Platform alerts feed */}
      <Card data-testid="notif-alerts-card">
        <CardHeader>
          <CardTitle className="text-base">Platform alerts</CardTitle>
          <CardDescription>
            The latest warning and critical events recorded in the platform audit log.
          </CardDescription>
          <CardAction>
            <Badge
              variant={criticalCount > 0 ? "destructive" : "muted"}
              data-testid="notif-alerts-count"
            >
              {alerts.length} alert{alerts.length === 1 ? "" : "s"}
              {criticalCount > 0 ? ` · ${criticalCount} critical` : ""}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          <QueryBoundary
            isLoading={warningQ.isLoading || criticalQ.isLoading}
            error={warningQ.error ?? criticalQ.error}
            onRetry={() => {
              void warningQ.refetch();
              void criticalQ.refetch();
            }}
          >
            {alerts.length === 0 ? (
              <EmptyState
                icon="checkCircle"
                title="No active alerts"
                description="No warning or critical events in the recent platform audit trail."
                testId="notif-alerts-empty"
                className="mx-6"
              />
            ) : (
              <ul className="divide-y divide-border">
                {alerts.map((a) => (
                  <AlertItem key={a.id} log={a} />
                ))}
              </ul>
            )}
          </QueryBoundary>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          Shows up to the latest 25 warning and 25 critical events. The full, filterable trail
          lives in Audit logs.
        </CardFooter>
      </Card>
    </div>
  );
}
