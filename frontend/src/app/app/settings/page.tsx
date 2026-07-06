"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { SettingsNav } from "./settings-nav";
import { useSession } from "@/components/providers/session-provider";
import { removeAvatar, updateProfile, uploadAvatar } from "@/lib/api/services/account";
import {
  getNotificationPrefs,
  updateNotificationPrefs,
  type NotificationKind,
  type NotificationPrefs,
} from "@/lib/api/services/notifications";
import { ApiError } from "@/lib/api/errors";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { QueryBoundary } from "@/components/ui/query-boundary";

const LOCALES = [
  { value: "en-IN", label: "English (India)" },
  { value: "hi-IN", label: "हिन्दी (India)" },
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
];

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "India Standard Time (IST · UTC+5:30)" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (UTC+4:00)" },
  { value: "Asia/Singapore", label: "Singapore Time (UTC+8:00)" },
  { value: "Europe/London", label: "Greenwich Mean Time (UTC+0:00)" },
  { value: "America/New_York", label: "Eastern Time (UTC−5:00)" },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const KIND_META: { kind: NotificationKind; label: string; hint: string }[] = [
  { kind: "billing", label: "Billing & invoices", hint: "Payments, plan changes, failed charges" },
  { kind: "ticket", label: "Support tickets", hint: "Replies and status changes on your tickets" },
  { kind: "system", label: "System & security", hint: "Security alerts and platform notices" },
  { kind: "usage", label: "Usage & quota", hint: "Quota warnings as you approach your plan limit" },
  { kind: "key", label: "API keys", hint: "Keys created, rotated or revoked" },
  { kind: "sync", label: "Pincode syncs", hint: "Nightly India Post sync results" },
];

/** Per-user notification channel preferences (in-app / email, per event kind). */
function NotificationPrefsCard() {
  const qc = useQueryClient();
  const prefsQ = useQuery({ queryKey: ["notification-prefs"], queryFn: getNotificationPrefs });
  const [draft, setDraft] = useState<NotificationPrefs | null>(null);
  const prefs = draft ?? prefsQ.data ?? null;

  const saveM = useMutation({
    mutationFn: (next: NotificationPrefs) =>
      updateNotificationPrefs({ email_enabled: next.email_enabled, kinds: next.kinds }),
    onSuccess: (saved) => {
      qc.setQueryData(["notification-prefs"], saved);
      setDraft(null);
      toast.success("Notification preferences saved");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save preferences"),
  });

  function patchKind(kind: NotificationKind, channel: "in_app" | "email", value: boolean) {
    if (!prefs) return;
    setDraft({ ...prefs, kinds: { ...prefs.kinds, [kind]: { ...prefs.kinds[kind], [channel]: value } } });
  }

  const dirty = draft !== null;

  return (
    <Card id="notifications" data-testid="notif-prefs-card" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="text-base">Notification preferences</CardTitle>
        <CardDescription>
          Choose which events reach you in-app and which also email you at your account address.
        </CardDescription>
        <CardAction>
          <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
            <Icon name="notifications" size={18} />
          </span>
        </CardAction>
      </CardHeader>
      <QueryBoundary isLoading={prefsQ.isLoading} error={prefsQ.error} onRetry={() => void prefsQ.refetch()}>
        {prefs && (
          <>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="text-sm font-medium">Email notifications</p>
                  <p className="text-xs text-muted-foreground">
                    Master switch — turn off to stop all notification emails without touching the per-event settings.
                  </p>
                </div>
                <Switch
                  checked={prefs.email_enabled}
                  onCheckedChange={(v) => setDraft({ ...prefs, email_enabled: v })}
                  data-testid="notif-prefs-email-master-switch"
                />
              </div>

              <div className="overflow-hidden rounded-xl border">
                <div className="grid grid-cols-[1fr_4rem_4rem] items-center gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Event</span>
                  <span className="text-center">In-app</span>
                  <span className="text-center">Email</span>
                </div>
                {KIND_META.map(({ kind, label, hint }) => (
                  <div
                    key={kind}
                    className="grid grid-cols-[1fr_4rem_4rem] items-center gap-2 border-b px-4 py-3 last:border-b-0"
                    data-testid={`notif-prefs-row-${kind}`}
                  >
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{hint}</p>
                    </div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={prefs.kinds[kind].in_app}
                        onCheckedChange={(v) => patchKind(kind, "in_app", v === true)}
                        data-testid={`notif-prefs-${kind}-inapp-checkbox`}
                      />
                    </div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={prefs.kinds[kind].email}
                        disabled={!prefs.email_enabled}
                        onCheckedChange={(v) => patchKind(kind, "email", v === true)}
                        data-testid={`notif-prefs-${kind}-email-checkbox`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!dirty || saveM.isPending}
                onClick={() => setDraft(null)}
                data-testid="notif-prefs-reset-btn"
              >
                Reset
              </Button>
              <Button
                type="button"
                variant="gradient"
                className="group"
                disabled={!dirty || saveM.isPending}
                onClick={() => prefs && saveM.mutate(prefs)}
                data-testid="notif-prefs-save-btn"
              >
                <Icon name="check" size={16} className="text-white" />
                {saveM.isPending ? "Saving…" : "Save preferences"}
              </Button>
            </CardFooter>
          </>
        )}
      </QueryBoundary>
    </Card>
  );
}

export default function ProfileSettingsPage() {
  const { user, company: sessionCompany, refresh } = useSession();
  const [name, setName] = useState("");
  const [locale, setLocale] = useState("en-IN");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const email = user?.email ?? "";
  const company = sessionCompany?.name ?? "";

  useEffect(() => {
    if (user) {
      setName(user.name);
      setLocale(user.locale || "en-IN");
      setTimezone(user.timezone || "Asia/Kolkata");
    }
  }, [user]);

  const saveM = useMutation({
    mutationFn: () => updateProfile({ name: name.trim(), locale, timezone }),
    onSuccess: async () => {
      await refresh();
      toast.success("Profile updated", { description: "Your account details have been saved." });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't save your profile"),
  });
  const saving = saveM.isPending;

  const fileRef = useRef<HTMLInputElement>(null);
  const MAX_AVATAR_BYTES = 5_000_000;
  const uploadM = useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: async () => {
      await refresh();
      toast.success("Photo updated", { description: "Your new profile photo is live." });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't upload the photo"),
  });
  const removeAvatarM = useMutation({
    mutationFn: removeAvatar,
    onSuccess: async () => {
      await refresh();
      toast("Photo removed");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't remove the photo"),
  });

  function onAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
      toast.error("Choose a PNG, JPG, WebP or GIF image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(`"${file.name}" is ${(file.size / 1e6).toFixed(1)} MB — the limit is 5 MB.`);
      return;
    }
    uploadM.mutate(file);
  }

  function save() {
    if (name.trim().length < 2) {
      toast.error("Name must be at least 2 characters.");
      return;
    }
    saveM.mutate();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your profile, team and account security."
        eyebrow="Account"
      />

      <SettingsNav />

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        data-testid="profile-form"
      >
        {/* Avatar + identity */}
        <Card data-testid="profile-identity-card">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>
              This information is shown on your tickets, audit logs and invoices.
            </CardDescription>
            <CardAction>
              <Badge variant="success" data-testid="profile-status-badge">
                <span className="size-1.5 rounded-full bg-current" />
                Verified
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Avatar className="size-20 ring-2 ring-border">
                {user?.avatar_url && <AvatarImage src={user.avatar_url} alt={name} />}
                <AvatarFallback className="text-lg">{initials(name || "U")}</AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={onAvatarPick}
                  data-testid="profile-avatar-file-input"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="group"
                    disabled={uploadM.isPending}
                    onClick={() => fileRef.current?.click()}
                    data-testid="profile-avatar-upload-btn"
                  >
                    <Icon name="upload" size={15} />{" "}
                    {uploadM.isPending ? "Uploading…" : "Upload photo"}
                  </Button>
                  {user?.avatar_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="group text-muted-foreground"
                      disabled={removeAvatarM.isPending}
                      onClick={() => removeAvatarM.mutate()}
                      data-testid="profile-avatar-remove-btn"
                    >
                      <Icon name="trash" size={15} /> Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, WebP or GIF · up to 5&nbsp;MB. A square image works best.
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Full name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aarav Sharma"
                  data-testid="profile-name-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-email">Email address</Label>
                <div className="relative">
                  <Input
                    id="profile-email"
                    type="email"
                    value={email}
                    readOnly
                    placeholder="you@company.in"
                    className="pr-10 bg-muted/40"
                    data-testid="profile-email-input"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-success">
                    <Icon name="verified" size={16} />
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Used for sign-in and account notifications.
                </p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="profile-company">Company</Label>
                <Input
                  id="profile-company"
                  value={company}
                  readOnly
                  placeholder="FlipMart Retail Pvt Ltd"
                  className="bg-muted/40"
                  data-testid="profile-company-input"
                />
                <p className="text-xs text-muted-foreground">Your organization name. Managed by an account owner.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Localization */}
        <Card data-testid="profile-localization-card">
          <CardHeader>
            <CardTitle className="text-base">Localization</CardTitle>
            <CardDescription>
              Controls number, currency and date formatting across the dashboard.
            </CardDescription>
            <CardAction>
              <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                <Icon name="globe" size={18} />
              </span>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-locale">Language &amp; region</Label>
              <Select value={locale} onValueChange={setLocale}>
                <SelectTrigger id="profile-locale" data-testid="profile-locale-select">
                  <SelectValue placeholder="Select a locale" />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-timezone">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="profile-timezone" data-testid="profile-timezone-select">
                  <SelectValue placeholder="Select a timezone" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardFooter className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setName(user?.name ?? "");
                setLocale(user?.locale || "en-IN");
                setTimezone(user?.timezone || "Asia/Kolkata");
                toast("Changes discarded");
              }}
              data-testid="profile-reset-btn"
            >
              Reset
            </Button>
            <Button
              type="submit"
              variant="gradient"
              disabled={saving}
              className="group"
              data-testid="profile-save-btn"
            >
              <Icon name="check" size={16} className="text-white" />
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <NotificationPrefsCard />
    </div>
  );
}
