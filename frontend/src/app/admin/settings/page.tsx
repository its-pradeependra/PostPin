"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

import {
  listPlatformSettings,
  updatePlatformSetting,
  type PlatformSetting,
} from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";
import { formatRelativeTime } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Per-key presentation (titles/descriptions only — values are live)  */
/* ------------------------------------------------------------------ */

interface KeyMeta {
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  link?: { href: string; label: string };
}

const KEY_META: Record<string, KeyMeta> = {
  "engine.defaults": {
    title: "Rate engine defaults",
    description:
      "Platform-wide defaults the rate engine applies unless a rate card overrides them. Monetary fields are stored in paise, percentages in basis points (bps).",
    icon: "percent",
  },
  "pincode.sync": {
    title: "Pincode sync",
    description:
      "Source, schedule and reliability settings for the India Post pincode master sync.",
    icon: "sync",
    link: { href: "/admin/pincodes/sync-settings", label: "Open Sync settings" },
  },
  "logs.retention": {
    title: "Log retention",
    description:
      "How long API logs, audit trails and notifications are kept before being pruned.",
    icon: "audit",
  },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** "gstBps" → "Gst bps", "timeIST" → "Time IST", "logs.retention" → "Logs retention" */
function humanize(key: string) {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function slugify(key: string) {
  return key.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
}

function isScalar(v: unknown): boolean {
  return typeof v === "number" || typeof v === "string" || typeof v === "boolean";
}

/** Editable draft: numbers → strings; arrays/null/deep objects → JSON strings. */
function toDraft(value: Record<string, unknown>): Record<string, unknown> {
  const conv = (v: unknown): unknown => {
    if (typeof v === "number") return String(v);
    if (typeof v === "string" || typeof v === "boolean") return v;
    return JSON.stringify(v); // array / null / nested object → JSON text
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (isPlainObject(v)) {
      const nested: Record<string, unknown> = {};
      for (const [nk, nv] of Object.entries(v)) nested[nk] = conv(nv);
      out[k] = nested;
    } else out[k] = conv(v);
  }
  return out;
}

function coercePrimitive(original: unknown, draft: unknown): { ok: boolean; value?: unknown } {
  if (typeof original === "number") {
    const s = typeof draft === "string" ? draft.trim() : String(draft ?? "");
    if (s === "") return { ok: false };
    const n = Number(s);
    if (!Number.isFinite(n)) return { ok: false };
    return { ok: true, value: n };
  }
  return { ok: true, value: draft };
}

/** Parse a JSON-editable field (arrays / null / nested objects) from its draft text. */
function coerceJson(original: unknown, draft: unknown): { ok: boolean; changed: boolean; value?: unknown } {
  const raw = typeof draft === "string" ? draft : JSON.stringify(original);
  try {
    const parsed = JSON.parse(raw);
    return { ok: true, changed: JSON.stringify(parsed) !== JSON.stringify(original), value: parsed };
  } catch {
    return { ok: false, changed: false };
  }
}

/**
 * Diff the draft against the stored value. The API does a shallow top-level
 * merge, so a changed nested field sends its whole (coerced) parent object.
 */
function computeChanges(original: Record<string, unknown>, draft: Record<string, unknown>) {
  const changed: Record<string, unknown> = {};
  const invalid: string[] = [];

  for (const [k, ov] of Object.entries(original)) {
    if (isPlainObject(ov)) {
      const dv = isPlainObject(draft[k]) ? (draft[k] as Record<string, unknown>) : {};
      const merged: Record<string, unknown> = {};
      let nestedChanged = false;
      for (const [nk, nov] of Object.entries(ov)) {
        if (isScalar(nov)) {
          const res = coercePrimitive(nov, dv[nk]);
          if (!res.ok) {
            invalid.push(`${humanize(k)} › ${humanize(nk)}`);
            merged[nk] = nov;
            continue;
          }
          merged[nk] = res.value;
          if (res.value !== nov) nestedChanged = true;
        } else {
          const jf = coerceJson(nov, dv[nk]);
          if (!jf.ok) {
            invalid.push(`${humanize(k)} › ${humanize(nk)}`);
            merged[nk] = nov;
            continue;
          }
          merged[nk] = jf.value;
          if (jf.changed) nestedChanged = true;
        }
      }
      if (nestedChanged) changed[k] = merged;
    } else if (isScalar(ov)) {
      const res = coercePrimitive(ov, draft[k]);
      if (!res.ok) {
        invalid.push(humanize(k));
        continue;
      }
      if (res.value !== ov) changed[k] = res.value;
    } else {
      const jf = coerceJson(ov, draft[k]);
      if (!jf.ok) {
        invalid.push(humanize(k));
        continue;
      }
      if (jf.changed) changed[k] = jf.value;
    }
  }
  return { changed, invalid };
}

/* ------------------------------------------------------------------ */
/* Field renderer — control type follows the stored value's type      */
/* ------------------------------------------------------------------ */

function FieldRow({
  slug,
  path,
  original,
  value,
  onChange,
}: {
  slug: string;
  path: string[];
  original: unknown;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `settings-${slug}-${path.map(slugify).join("-")}`;
  const label = humanize(path[path.length - 1]);

  if (typeof original === "boolean") {
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        <Switch
          id={id}
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(checked)}
          data-testid={`${id}-switch`}
        />
      </div>
    );
  }

  if (typeof original === "number") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type="number"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono tabular-nums"
          data-testid={`${id}-input`}
        />
      </div>
    );
  }

  if (typeof original === "string") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm"
          data-testid={`${id}-input`}
        />
      </div>
    );
  }

  // Arrays / null / nested objects — editable as JSON, validated on save.
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={typeof value === "string" ? value : JSON.stringify(original)}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="font-mono text-xs"
        data-testid={`${id}-input`}
      />
      <p className="text-xs text-muted-foreground">JSON value — must stay valid JSON.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One card per stored platform setting                                */
/* ------------------------------------------------------------------ */

function SettingCard({ setting }: { setting: PlatformSetting }) {
  const qc = useQueryClient();
  const meta: KeyMeta = KEY_META[setting.key] ?? {
    title: humanize(setting.key),
    description: "Stored platform setting.",
    icon: "settings",
  };
  const slug = slugify(setting.key);

  const [draft, setDraft] = React.useState<Record<string, unknown>>(() => toDraft(setting.value));
  const { changed, invalid } = computeChanges(setting.value, draft);
  const dirty = Object.keys(changed).length > 0;

  const saveM = useMutation({
    mutationFn: () => updatePlatformSetting(setting.key, changed),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "settings"] });
      toast.success(`${meta.title} saved`);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn't save this setting"),
  });

  function setTop(k: string, v: unknown) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function setNested(k: string, nk: string, v: unknown) {
    setDraft((d) => ({
      ...d,
      [k]: { ...(isPlainObject(d[k]) ? (d[k] as Record<string, unknown>) : {}), [nk]: v },
    }));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (invalid.length > 0) {
      toast.error(`Enter a valid number for: ${invalid.join(", ")}`);
      return;
    }
    if (!dirty || saveM.isPending) return;
    saveM.mutate();
  }

  function reset() {
    setDraft(toDraft(setting.value));
  }

  const entries = Object.entries(setting.value);
  const flat = entries.filter(([, v]) => !isPlainObject(v));
  const nested = entries.filter((e): e is [string, Record<string, unknown>] => isPlainObject(e[1]));

  return (
    <form onSubmit={save}>
      <Card data-testid={`settings-card-${slug}`}>
        <CardHeader>
          <CardTitle className="text-base">{meta.title}</CardTitle>
          <CardDescription>{meta.description}</CardDescription>
          <CardAction>
            <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
              <Icon name={meta.icon} size={18} />
            </span>
          </CardAction>
        </CardHeader>

        <CardContent className="space-y-5">
          {flat.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2">
              {flat.map(([k, ov]) => (
                <FieldRow
                  key={k}
                  slug={slug}
                  path={[k]}
                  original={ov}
                  value={draft[k]}
                  onChange={(v) => setTop(k, v)}
                />
              ))}
            </div>
          )}

          {nested.map(([k, obj]) => (
            <div key={k} className="space-y-3">
              <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {humanize(k)}
              </p>
              <div className="grid gap-5 sm:grid-cols-2">
                {Object.entries(obj).map(([nk, nov]) => (
                  <FieldRow
                    key={nk}
                    slug={slug}
                    path={[k, nk]}
                    original={nov}
                    value={isPlainObject(draft[k]) ? (draft[k] as Record<string, unknown>)[nk] : undefined}
                    onChange={(v) => setNested(k, nk, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </CardContent>

        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="muted" data-testid={`settings-${slug}-editable-badge`}>
              <Icon name="lock" size={12} className="mr-1" />
              {humanize(setting.editable_by)}
            </Badge>
            <span data-testid={`settings-${slug}-updated-at`}>
              Updated {formatRelativeTime(setting.updated_at)}
            </span>
            {meta.link && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="group"
                data-testid={`settings-${slug}-link`}
              >
                <Link href={meta.link.href}>
                  <Icon name="external" size={15} />
                  {meta.link.label}
                </Link>
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={reset}
              disabled={!dirty || saveM.isPending}
              data-testid={`settings-${slug}-reset-btn`}
            >
              Reset
            </Button>
            <Button
              type="submit"
              variant="gradient"
              className="group"
              disabled={!dirty || saveM.isPending}
              data-testid={`settings-${slug}-save-btn`}
            >
              <Icon name="check" size={16} className="text-white" />
              {saveM.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AdminSettingsPage() {
  const q = useQuery({ queryKey: ["admin", "settings"], queryFn: listPlatformSettings });
  const settings = q.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform settings"
        description="Live platform configuration — every card below maps to a stored setting and saves straight to the API."
        eyebrow="Platform"
      >
        <Badge variant="muted" data-testid="settings-scope-badge">
          <Icon name="shield" size={14} className="mr-1 text-primary" />
          Super Admin only
        </Badge>
      </PageHeader>

      <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
        {settings.length === 0 ? (
          <EmptyState
            icon="settings"
            title="No platform settings"
            description="Settings appear here once the platform seed has run."
            testId="settings-empty-state"
          />
        ) : (
          <div className="space-y-6">
            {settings.map((s) => (
              // Remount on refetch so drafts re-sync with the saved value.
              <SettingCard key={`${s.key}:${s.updated_at}`} setting={s} />
            ))}
          </div>
        )}
      </QueryBoundary>

      <p className="text-sm text-muted-foreground" data-testid="settings-deferred-note">
        Every stored setting above is editable here and saves straight to the API. Secrets —
        payment-gateway keys and SMTP credentials — stay in the server environment by design and
        are never exposed to the dashboard.
      </p>
    </div>
  );
}
