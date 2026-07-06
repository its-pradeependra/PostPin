"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { SettingsNav } from "../settings-nav";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TwoFactorCard } from "@/components/shared/two-factor-card";
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
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

import { changePassword, listSessions, revokeOtherSessions, revokeSession } from "@/lib/api/services/account";
import { createTicket } from "@/lib/api/services/tickets";
import { ApiError } from "@/lib/api/errors";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Lightweight password strength score 0–4. */
function scorePassword(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}

const STRENGTH = [
  { label: "Too weak", color: "bg-destructive", text: "text-destructive" },
  { label: "Weak", color: "bg-destructive", text: "text-destructive" },
  { label: "Fair", color: "bg-warning", text: "text-warning" },
  { label: "Good", color: "bg-info", text: "text-info" },
  { label: "Strong", color: "bg-success", text: "text-success" },
];

export default function SecuritySettingsPage() {
  const qc = useQueryClient();

  // ── Change password ───────────────────────────────────────────
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);

  const score = useMemo(() => scorePassword(next), [next]);
  const mismatch = confirm.length > 0 && next !== confirm;

  const changePwM = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: (res) => {
      setCurrent("");
      setNext("");
      setConfirm("");
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Password changed", {
        description:
          res.otherSessionsRevoked > 0
            ? `Your new password is active. ${res.otherSessionsRevoked} other device${res.otherSessionsRevoked === 1 ? " was" : "s were"} signed out.`
            : "Use your new password next time you sign in.",
      });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't change your password"),
  });

  function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return toast.error("Enter your current password.");
    if (next.length < 12) return toast.error("New password must be at least 12 characters.");
    if (score < 2) return toast.error("Choose a stronger password.");
    if (next !== confirm) return toast.error("New passwords don’t match.");
    changePwM.mutate();
  }

  // ── Sessions ──────────────────────────────────────────────────
  const sessionsQ = useQuery({ queryKey: ["sessions"], queryFn: listSessions });
  const sessions = sessionsQ.data ?? [];
  const otherCount = sessions.filter((s) => !s.current).length;

  const revokeM = useMutation({
    mutationFn: (id: string) => revokeSession(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Session revoked", { description: "That device has been signed out." });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't revoke that session"),
  });

  const revokeAllM = useMutation({
    mutationFn: () => revokeOtherSessions(),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Other sessions revoked", { description: `${r.revoked} device${r.revoked === 1 ? "" : "s"} signed out.` });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't revoke sessions"),
  });

  // ── Delete account (files a real deletion request ticket) ──────
  const deleteM = useMutation({
    mutationFn: () =>
      createTicket({
        subject: "Account deletion request",
        category: "account",
        priority: "high",
        body: "I request permanent deletion of my account and all associated workspace data.",
      }),
    onSuccess: (t) =>
      toast.success("Deletion request received", {
        description: `Ticket ${t.id} was created. Our team will process it within 24 hours.`,
      }),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't submit your request"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your profile, team and account security." eyebrow="Account" />

      <SettingsNav />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Change password */}
        <Card data-testid="security-password-card">
          <CardHeader>
            <CardTitle className="text-base">Change password</CardTitle>
            <CardDescription>Use at least 12 characters with a mix of letters, numbers &amp; symbols.</CardDescription>
            <CardAction>
              <span className="grid size-10 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                <Icon name="lock" size={18} />
              </span>
            </CardAction>
          </CardHeader>
          <form onSubmit={updatePassword} data-testid="security-password-form">
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current-pw">Current password</Label>
                <Input
                  id="current-pw"
                  type={show ? "text" : "password"}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                  data-testid="security-current-pw-input"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="new-pw">New password</Label>
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="group inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    data-testid="security-pw-visibility-btn"
                  >
                    <Icon name={show ? "eyeOff" : "eye"} size={14} />
                    {show ? "Hide" : "Show"}
                  </button>
                </div>
                <Input
                  id="new-pw"
                  type={show ? "text" : "password"}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  autoComplete="new-password"
                  data-testid="security-new-pw-input"
                />
                {next.length > 0 && (
                  <div className="space-y-1" data-testid="security-pw-strength">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={cn("h-1.5 flex-1 rounded-full transition-colors", i < score ? STRENGTH[score].color : "bg-muted")}
                        />
                      ))}
                    </div>
                    <p className={cn("text-xs font-medium", STRENGTH[score].text)}>{STRENGTH[score].label}</p>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pw">Confirm new password</Label>
                <Input
                  id="confirm-pw"
                  type={show ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={mismatch}
                  aria-describedby={mismatch ? "confirm-pw-error" : undefined}
                  data-testid="security-confirm-pw-input"
                />
                {mismatch && (
                  <p id="confirm-pw-error" className="text-xs text-destructive" role="alert">
                    Passwords don&apos;t match.
                  </p>
                )}
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" variant="gradient" disabled={changePwM.isPending} className="group" data-testid="security-update-pw-btn">
                <Icon name="check" size={16} className="text-white" />
                {changePwM.isPending ? "Updating…" : "Update password"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* 2FA — live TOTP enrollment (same flow as platform staff) */}
        <TwoFactorCard
          testIdPrefix="security-2fa"
          description="Add an extra layer of security with an authenticator app (TOTP)."
        />
      </div>

      {/* Active sessions */}
      <Card data-testid="security-sessions-card">
        <CardHeader>
          <CardTitle className="text-base">Active sessions</CardTitle>
          <CardDescription>Devices currently signed in to your account.</CardDescription>
          <CardAction>
            <ConfirmDialog
              testId="security-revoke-all-dialog"
              title="Sign out all other sessions?"
              description="Every device except this one will be signed out immediately. You'll stay signed in here."
              confirmLabel="Revoke all others"
              destructive
              onConfirm={() => revokeAllM.mutate()}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="group"
                  disabled={otherCount === 0 || revokeAllM.isPending}
                  data-testid="security-revoke-all-btn"
                >
                  <Icon name="logout" size={15} /> Revoke all others
                </Button>
              }
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <QueryBoundary isLoading={sessionsQ.isLoading} error={sessionsQ.error} onRetry={() => void sessionsQ.refetch()}>
            <div className="-mx-2 overflow-x-auto sm:mx-0">
              <Table data-testid="security-sessions-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead className="hidden md:table-cell">Location</TableHead>
                    <TableHead className="hidden lg:table-cell">Last active</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id} data-testid={`security-session-row-${s.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon name="globe" size={16} className="text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-sm font-medium">
                              {s.device}
                              {s.current && (
                                <Badge variant="info" className="text-[10px]">
                                  This device
                                </Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">{s.browser}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-sm">{s.location}</p>
                        <p className="font-mono text-xs text-muted-foreground tabular-nums">{s.ip}</p>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground tabular-nums lg:table-cell">
                        {formatRelativeTime(s.last_active_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.current ? (
                          <span className="text-xs text-muted-foreground">Current</span>
                        ) : (
                          <ConfirmDialog
                            testId={`security-revoke-dialog-${s.id}`}
                            title={`Revoke ${s.device}?`}
                            description="This device will be signed out and will need to authenticate again."
                            confirmLabel="Revoke session"
                            destructive
                            onConfirm={() => revokeM.mutate(s.id)}
                            trigger={
                              <Button
                                variant="ghost"
                                size="sm"
                                className="group text-muted-foreground hover:text-destructive"
                                data-testid={`security-revoke-btn-${s.id}`}
                              >
                                <Icon name="logout" size={15} /> Revoke
                              </Button>
                            }
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </QueryBoundary>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/40" data-testid="security-danger-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <Icon name="trash" size={18} className="text-destructive" /> Danger zone
          </CardTitle>
          <CardDescription>Irreversible actions that affect your entire account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTitle>Delete account</AlertTitle>
            <AlertDescription>
              Request permanent deletion of your account, API keys, rate cards and all workspace data. Active subscriptions are
              cancelled. This cannot be undone.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="justify-end">
          <ConfirmDialog
            testId="security-delete-account-dialog"
            title="Request account deletion?"
            description="This raises a high-priority request to permanently remove your account and all associated data, keys and invoices. Our team will confirm before anything is deleted."
            confirmLabel="Request deletion"
            destructive
            onConfirm={() => deleteM.mutate()}
            trigger={
              <Button variant="destructive" className="group" disabled={deleteM.isPending} data-testid="security-delete-account-btn">
                <Icon name="trash" size={16} /> Delete account
              </Button>
            }
          />
        </CardFooter>
      </Card>
    </div>
  );
}
