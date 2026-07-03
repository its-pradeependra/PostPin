"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { SettingsNav } from "./settings-nav";
import { useSession } from "@/components/providers/session-provider";
import { updateProfile } from "@/lib/api/services/account";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

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
                <AvatarFallback className="text-lg">{initials(name || "U")}</AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="group"
                    onClick={() =>
                      toast.success("Avatar updated", {
                        description: "Your new profile photo is live.",
                      })
                    }
                    data-testid="profile-avatar-upload-btn"
                  >
                    <Icon name="upload" trigger="group-hover" size={15} /> Upload photo
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="group text-muted-foreground"
                    onClick={() => toast("Avatar removed")}
                    data-testid="profile-avatar-remove-btn"
                  >
                    <Icon name="trash" trigger="group-hover" size={15} /> Remove
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG or GIF · up to 2&nbsp;MB. A square image works best.
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
                <Icon name="globe" trigger="loop" size={18} />
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
              <Icon name="check" trigger="group-hover" size={16} className="text-white" />
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
