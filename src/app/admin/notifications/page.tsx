"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon, type IconName } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@/components/ui/card";

import { listAdminAuditLogs, type AdminAuditLog } from "@/lib/api/services/admin";
import { formatRelativeTime, formatDateTime } from "@/lib/format";

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
            <Icon name="audit" trigger="group-hover" size={16} />
            View audit logs
          </Link>
        </Button>
      </PageHeader>

      {/* Deferral note: channels + templates are not built yet */}
      <Card className="border-dashed bg-muted/30" data-testid="notif-deferral-card">
        <CardContent className="flex items-start gap-3 py-4">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Icon name="send" size={16} />
          </span>
          <p className="text-sm text-muted-foreground">
            Delivery channels (email/Slack) and templates are coming soon — this feed shows real
            warning+critical platform events.
          </p>
        </CardContent>
      </Card>

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
