"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { getSyncSettings, updateSyncSettings } from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";

/** Keys rendered with dedicated controls; everything else is passed through generically. */
const SPECIAL_KEYS = ["source", "schedule", "notificationEmail"] as const;

const KNOWN_LABELS: Record<string, string> = {
  source: "Source",
  schedule: "Schedule",
  notificationEmail: "Notification email",
  endpoint: "Endpoint",
  timeIST: "Sync time (IST)",
  retries: "Retry count",
  timeoutMs: "Timeout (ms)",
  enabled: "Enabled",
};

function labelFor(key: string) {
  return (
    KNOWN_LABELS[key] ??
    key
      .replace(/[_-]/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase())
  );
}

const SETTING_HELP = [
  {
    icon: "database" as const,
    label: "Source",
    desc: "The official data.gov.in India Post directory. Live sync, nightly auto-sync, and CSV import all feed the same master.",
  },
  {
    icon: "clock" as const,
    label: "Schedule",
    desc: "Auto-syncs nightly at the configured IST time; run an on-demand sync anytime from Pincode Master.",
  },
  {
    icon: "mail" as const,
    label: "Notification email",
    desc: "Address that receives sync success and failure alerts.",
  },
];

const IMPORT_PIPELINE = [
  {
    icon: "upload" as const,
    name: "Upload & validate",
    desc: "The CSV header is checked and every row's pincode is validated.",
  },
  {
    icon: "database" as const,
    name: "Upsert records",
    desc: "Valid rows are added or updated in the master by pincode.",
  },
  {
    icon: "audit" as const,
    name: "Log the run",
    desc: "Counts and failed rows are recorded as an audited sync run.",
  },
];

export default function PincodeSyncSettingsPage() {
  const qc = useQueryClient();

  const settingsQ = useQuery({
    queryKey: ["admin", "pincodes", "sync-settings"],
    queryFn: getSyncSettings,
  });

  const [draft, setDraft] = React.useState<Record<string, unknown> | null>(null);

  // Initialise the form once from the API; the API's shape drives the fields.
  React.useEffect(() => {
    if (settingsQ.data && draft === null) {
      setDraft({ schedule: "manual", notificationEmail: "", ...settingsQ.data });
    }
  }, [settingsQ.data, draft]);

  const saveM = useMutation({
    mutationFn: (patch: Record<string, unknown>) => updateSyncSettings(patch),
    onSuccess: (settings) => {
      setDraft({ schedule: "manual", notificationEmail: "", ...settings });
      void qc.invalidateQueries({ queryKey: ["admin", "pincodes", "sync-settings"] });
      toast.success("Sync settings saved");
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn't save sync settings"),
  });

  function setField(key: string, value: unknown) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function reset() {
    if (settingsQ.data) {
      setDraft({ schedule: "manual", notificationEmail: "", ...settingsQ.data });
      toast("Changes discarded");
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const email = String(draft.notificationEmail ?? "");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid notification email.");
      return;
    }
    // "source" is read-only — everything else is sent as the patch.
    const patch = Object.fromEntries(
      Object.entries(draft).filter(([k]) => k !== "source"),
    );
    saveM.mutate(patch);
  }

  const source = draft?.source != null ? String(draft.source) : "";
  const schedule = typeof draft?.schedule === "string" ? draft.schedule : "manual";
  const notificationEmail =
    typeof draft?.notificationEmail === "string" ? draft.notificationEmail : "";
  const extraKeys = draft
    ? Object.keys(draft)
        .filter((k) => !(SPECIAL_KEYS as readonly string[]).includes(k))
        .sort()
    : [];
  const scheduleOptions = ["manual", "nightly"].includes(schedule)
    ? ["manual", "nightly"]
    : ["manual", "nightly", schedule];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pincode Sync Settings"
        description="Configure how the pincode master is refreshed — source, schedule and alerts."
        eyebrow="Operations"
      >
        <Button
          type="submit"
          form="sync-settings-form"
          variant="gradient"
          className="group"
          disabled={saveM.isPending || !draft}
          data-testid="sync-settings-save-btn"
        >
          <Icon name="check" trigger="group-hover" size={16} className="text-white" />
          {saveM.isPending ? "Saving…" : "Save changes"}
        </Button>
      </PageHeader>

      <QueryBoundary
        isLoading={settingsQ.isLoading || (!settingsQ.error && draft === null)}
        error={settingsQ.error}
        onRetry={() => void settingsQ.refetch()}
      >
        {draft && (
          <>
            {schedule === "manual" && (
              <Alert variant="warning" data-testid="sync-settings-autosync-warning">
                <Icon name="clock" size={16} />
                <AlertTitle>Automatic sync is off</AlertTitle>
                <AlertDescription>
                  The schedule is set to manual — pincode data refreshes only when a CSV is
                  imported from the Pincode Master page.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
              {/* ---- Settings form ---- */}
              <form
                id="sync-settings-form"
                onSubmit={save}
                className="space-y-6 lg:col-span-2"
                data-testid="sync-settings-form"
              >
                {/* Source */}
                <Card data-testid="sync-settings-source-card">
                  <CardHeader>
                    <CardTitle className="text-base">Source</CardTitle>
                    <CardDescription>
                      Where the pincode master gets its data. This field is read-only.
                    </CardDescription>
                    <CardAction>
                      <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                        <Icon name="database" size={18} />
                      </span>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="sync-source">Source</Label>
                      <Input
                        id="sync-source"
                        readOnly
                        disabled
                        value={source || "Not configured"}
                        className="font-mono text-sm"
                        data-testid="sync-settings-source-input"
                      />
                      <p className="text-xs text-muted-foreground">
                        Live India Post sync is coming soon — CSV import is the supported path.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Schedule & notifications */}
                <Card data-testid="sync-settings-schedule-card">
                  <CardHeader>
                    <CardTitle className="text-base">Schedule &amp; notifications</CardTitle>
                    <CardDescription>
                      When syncs run and who is told about the outcome.
                    </CardDescription>
                    <CardAction>
                      <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                        <Icon name="clock" trigger="loop" size={18} />
                      </span>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="sync-schedule">Schedule</Label>
                      <Select
                        value={schedule}
                        onValueChange={(v) => setField("schedule", v)}
                      >
                        <SelectTrigger
                          id="sync-schedule"
                          className="w-full"
                          data-testid="sync-settings-schedule-select"
                        >
                          <SelectValue placeholder="Schedule" />
                        </SelectTrigger>
                        <SelectContent>
                          {scheduleOptions.map((opt) => (
                            <SelectItem
                              key={opt}
                              value={opt}
                              className="capitalize"
                              data-testid={`sync-settings-schedule-${opt}`}
                            >
                              {opt.charAt(0).toUpperCase() + opt.slice(1).replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Manual = sync on CSV import only.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sync-email">Notification email</Label>
                      <Input
                        id="sync-email"
                        type="email"
                        value={notificationEmail}
                        onChange={(e) => setField("notificationEmail", e.target.value)}
                        placeholder="ops@postpin.dev"
                        className="font-mono text-sm"
                        data-testid="sync-settings-email-input"
                      />
                      <p className="text-xs text-muted-foreground">
                        Alerts on failed and partial runs.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Other stored settings, rendered from whatever the API returned */}
                {extraKeys.length > 0 && (
                  <Card data-testid="sync-settings-extra-card">
                    <CardHeader>
                      <CardTitle className="text-base">Additional settings</CardTitle>
                      <CardDescription>
                        Other keys stored on this setting — saved as-is with your changes.
                      </CardDescription>
                      <CardAction>
                        <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                          <Icon name="settings" size={18} />
                        </span>
                      </CardAction>
                    </CardHeader>
                    <CardContent className="grid gap-5 sm:grid-cols-2">
                      {extraKeys.map((key) => {
                        const value = draft[key];
                        if (typeof value === "boolean") {
                          return (
                            <div
                              key={key}
                              className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3 sm:col-span-2"
                            >
                              <Label htmlFor={`sync-field-${key}`} className="cursor-pointer">
                                {labelFor(key)}
                              </Label>
                              <Switch
                                id={`sync-field-${key}`}
                                checked={value}
                                onCheckedChange={(v) => setField(key, v)}
                                data-testid={`sync-settings-field-${key}-switch`}
                              />
                            </div>
                          );
                        }
                        if (typeof value === "number") {
                          return (
                            <div key={key} className="space-y-1.5">
                              <Label htmlFor={`sync-field-${key}`}>{labelFor(key)}</Label>
                              <Input
                                id={`sync-field-${key}`}
                                type="number"
                                value={value}
                                onChange={(e) => {
                                  const n = e.target.valueAsNumber;
                                  setField(key, Number.isNaN(n) ? 0 : n);
                                }}
                                className="font-mono tabular-nums"
                                data-testid={`sync-settings-field-${key}-input`}
                              />
                            </div>
                          );
                        }
                        if (typeof value === "string") {
                          return (
                            <div key={key} className="space-y-1.5">
                              <Label htmlFor={`sync-field-${key}`}>{labelFor(key)}</Label>
                              <Input
                                id={`sync-field-${key}`}
                                value={value}
                                onChange={(e) => setField(key, e.target.value)}
                                className="font-mono text-sm"
                                data-testid={`sync-settings-field-${key}-input`}
                              />
                            </div>
                          );
                        }
                        return (
                          <div key={key} className="space-y-1.5 sm:col-span-2">
                            <Label>{labelFor(key)}</Label>
                            <pre
                              className="overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground"
                              data-testid={`sync-settings-field-${key}-json`}
                            >
                              {JSON.stringify(value, null, 2)}
                            </pre>
                            <p className="text-xs text-muted-foreground">
                              Structured value — preserved unchanged on save.
                            </p>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                <CardFooter className="justify-end gap-2 px-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={reset}
                    data-testid="sync-settings-reset-btn"
                  >
                    Reset
                  </Button>
                  <Button
                    type="submit"
                    variant="gradient"
                    className="group"
                    disabled={saveM.isPending}
                    data-testid="sync-settings-save-footer-btn"
                  >
                    <Icon name="check" trigger="group-hover" size={16} className="text-white" />
                    {saveM.isPending ? "Saving…" : "Save changes"}
                  </Button>
                </CardFooter>
              </form>

              {/* ---- Side info ---- */}
              <div className="space-y-6">
                <Card data-testid="sync-settings-help-card">
                  <CardHeader>
                    <CardTitle className="text-base">What each setting does</CardTitle>
                    <CardDescription>A quick guide to the fields on the left.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {SETTING_HELP.map((item) => (
                      <div
                        key={item.label}
                        className="flex gap-3"
                        data-testid={`sync-settings-help-${item.icon}`}
                      >
                        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-gradient-soft text-primary">
                          <Icon name={item.icon} size={15} />
                        </span>
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card data-testid="sync-settings-pipeline-card">
                  <CardHeader>
                    <CardTitle className="text-base">How a CSV import runs</CardTitle>
                    <CardDescription>
                      Each import goes through these stages in order.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-0">
                    {IMPORT_PIPELINE.map((stage, i) => (
                      <div key={stage.name}>
                        {i > 0 && <Separator className="my-3" />}
                        <div
                          className="flex gap-3"
                          data-testid={`sync-settings-stage-${stage.icon}`}
                        >
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                            <span className="font-mono text-xs font-semibold tabular-nums">
                              {i + 1}
                            </span>
                          </span>
                          <div className="space-y-0.5">
                            <p className="flex items-center gap-1.5 text-sm font-medium">
                              <Icon name={stage.icon} size={14} className="text-primary" />
                              {stage.name}
                            </p>
                            <p className="text-xs text-muted-foreground">{stage.desc}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                  <CardFooter>
                    <p className="text-xs text-muted-foreground">
                      Live India Post sync is coming soon — CSV import from the Pincode Master
                      page is the supported path today.
                    </p>
                  </CardFooter>
                </Card>
              </div>
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
