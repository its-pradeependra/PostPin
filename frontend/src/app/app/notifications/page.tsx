"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationsPage as NotificationsPageData,
} from "@/lib/api/services/notifications";
import type { NotificationKind } from "@/lib/types";

/** Map a notification kind to an animated icon + accent tone. */
const KIND_META: Record<
  NotificationKind,
  { icon: IconName; tint: string; ring: string; iconColor: string; label: string }
> = {
  usage: { icon: "usage", tint: "bg-info/12", ring: "border-info/25", iconColor: "text-info", label: "Usage" },
  sync: { icon: "sync", tint: "bg-primary/12", ring: "border-primary/25", iconColor: "text-primary", label: "Sync" },
  key: { icon: "keys", tint: "bg-accent", ring: "border-border", iconColor: "text-foreground", label: "API keys" },
  billing: { icon: "billing", tint: "bg-success/12", ring: "border-success/25", iconColor: "text-success", label: "Billing" },
  ticket: { icon: "ticket", tint: "bg-warning/12", ring: "border-warning/25", iconColor: "text-warning", label: "Support" },
  system: { icon: "settings", tint: "bg-muted", ring: "border-border", iconColor: "text-muted-foreground", label: "System" },
};

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

const QKEY = ["notifications"] as const;

export default function NotificationsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: QKEY, queryFn: () => listNotifications(100) });
  const items = useMemo(() => q.data?.data ?? [], [q.data]);
  const unreadCount = q.data?.unreadCount ?? 0;

  const { today, earlier } = useMemo(() => {
    const today: AppNotification[] = [];
    const earlier: AppNotification[] = [];
    for (const n of items) (isToday(n.at) ? today : earlier).push(n);
    return { today, earlier };
  }, [items]);

  const readM = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QKEY });
      const prev = qc.getQueryData<NotificationsPageData>(QKEY);
      if (prev) {
        qc.setQueryData<NotificationsPageData>(QKEY, {
          ...prev,
          data: prev.data.map((n) => (n.id === id ? { ...n, read: true } : n)),
          unreadCount: Math.max(0, prev.unreadCount - 1),
        });
      }
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx?.prev && qc.setQueryData(QKEY, ctx.prev),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: QKEY });
      // Keep the topbar dot + sidebar badge in sync (they read a separate key).
      void qc.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    },
  });

  const allReadM = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: QKEY });
      const prev = qc.getQueryData<NotificationsPageData>(QKEY);
      if (prev) {
        qc.setQueryData<NotificationsPageData>(QKEY, {
          ...prev,
          data: prev.data.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(QKEY, ctx.prev),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: QKEY });
      // Keep the topbar dot + sidebar badge in sync (they read a separate key).
      void qc.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    },
  });

  const isEmpty = items.length === 0;
  const allRead = unreadCount === 0;

  return (
    <div className="space-y-6" data-testid="notif-page">
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        description="Activity across your usage, keys, billing, syncs and support."
      >
        <Badge variant={unreadCount > 0 ? "gradient" : "muted"} data-testid="notif-unread-badge">
          {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
        </Badge>
        <Button
          variant="outline"
          className="group"
          disabled={allRead || isEmpty || allReadM.isPending}
          onClick={() => allReadM.mutate()}
          data-testid="notif-mark-all-read-btn"
        >
          <Icon name="checkCircle" size={16} className="text-success" />
          Mark all read
        </Button>
      </PageHeader>

      <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
        {isEmpty ? (
          <EmptyState
            icon="notifications"
            title="You're all caught up"
            description="No notifications right now. We'll let you know when something needs your attention."
            testId="notif-empty"
          >
            <Button variant="gradient" asChild className="group" data-testid="notif-empty-settings-btn">
              <Link href="/app/settings">
                <Icon name="settings2" size={16} className="text-white" />
                Notification preferences
              </Link>
            </Button>
          </EmptyState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-8" data-testid="notif-feed">
              {today.length > 0 && (
                <NotificationGroup heading="Today" count={today.length} items={today} onRead={(id) => readM.mutate(id)} testId="notif-group-today" />
              )}
              {earlier.length > 0 && (
                <NotificationGroup heading="Earlier" count={earlier.length} items={earlier} onRead={(id) => readM.mutate(id)} testId="notif-group-earlier" />
              )}
            </div>

            <aside className="space-y-4">
              <Card data-testid="notif-preferences-card">
                <CardHeader>
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                    <Icon name="settings2" size={20} />
                  </span>
                  <CardTitle className="mt-3 text-base">Notification preferences</CardTitle>
                  <CardDescription>
                    Choose which events reach you and on which channels — in-app and email.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="gradient" asChild className="group w-full" data-testid="notif-preferences-link">
                    <Link href="/app/settings#notifications">
                      <Icon name="settings" size={16} className="text-white" />
                      Manage preferences
                      <Icon name="arrowRight" size={16} className="ml-auto text-white" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}

function NotificationGroup({
  heading,
  count,
  items,
  onRead,
  testId,
}: {
  heading: string;
  count: number;
  items: AppNotification[];
  onRead: (id: string) => void;
  testId: string;
}) {
  return (
    <section className="space-y-3" data-testid={testId}>
      <div className="flex items-center gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">{heading}</h2>
        <span className="font-mono text-xs tabular-nums text-muted-foreground/70">{count}</span>
      </div>
      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-border">
          {items.map((n) => (
            <NotificationRow key={n.id} notification={n} onRead={onRead} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

function NotificationRow({ notification, onRead }: { notification: AppNotification; onRead: (id: string) => void }) {
  const meta = KIND_META[notification.kind];
  const { id, title, body, read, at } = notification;

  return (
    <li>
      <button
        type="button"
        onClick={() => !read && onRead(id)}
        aria-pressed={read}
        data-testid={`notif-item-${id}`}
        className={cn(
          "group flex w-full items-start gap-3.5 px-4 py-4 text-left transition-colors sm:px-5",
          read ? "bg-transparent" : "bg-primary/4",
          !read && "hover:bg-primary/7",
          read && "hover:bg-accent/60",
        )}
      >
        <span
          className={cn("mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border", meta.tint, meta.ring, meta.iconColor)}
        >
          <Icon name={meta.icon} size={18} />
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className={cn("truncate text-sm", read ? "font-medium text-foreground/90" : "font-semibold text-foreground")}>
              {title}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <time
                dateTime={at}
                className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground"
                data-testid={`notif-item-time-${id}`}
              >
                {formatRelativeTime(at)}
              </time>
              {!read && (
                <span
                  className="size-2 shrink-0 rounded-full bg-brand-gradient shadow-glow"
                  aria-label="Unread"
                  data-testid={`notif-item-dot-${id}`}
                />
              )}
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          <div className="flex items-center gap-2 pt-0.5">
            <Badge variant="outline" className="text-[11px] font-normal">
              {meta.label}
            </Badge>
            {!read && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                <Icon name="check" size={12} />
                Mark read
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}
