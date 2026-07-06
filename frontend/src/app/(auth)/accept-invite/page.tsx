"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon } from "@/components/icons";
import { acceptInvite } from "@/lib/api/services/members";
import { ApiError } from "@/lib/api/errors";

type Requirement = { label: string; ok: boolean };

function scorePassword(pw: string): { score: number; reqs: Requirement[] } {
  const reqs: Requirement[] = [
    { label: "At least 12 characters", ok: pw.length >= 12 },
    { label: "Upper & lower case", ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { label: "A number", ok: /\d/.test(pw) },
    { label: "A symbol", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  return { score: reqs.filter((r) => r.ok).length, reqs };
}

const STRENGTH_META = [
  { label: "Too weak", color: "bg-destructive", pct: 12 },
  { label: "Weak", color: "bg-destructive", pct: 35 },
  { label: "Fair", color: "bg-warning", pct: 60 },
  { label: "Good", color: "bg-info", pct: 82 },
  { label: "Strong", color: "bg-success", pct: 100 },
] as const;

function AcceptInviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const hasToken = token !== null && token !== "";

  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tokenRejected, setTokenRejected] = React.useState(false);

  const { score, reqs } = scorePassword(password);
  const strength = STRENGTH_META[score];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError("Enter your full name.");
      return;
    }
    if (password.length < 12 || score < 3) {
      setError("Choose a stronger password — meet at least three requirements.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      await acceptInvite(token as string, name.trim(), password);
      toast.success("Welcome to the team!", { description: "Log in with your new password." });
      router.push("/login?invited=success");
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_token") {
        setTokenRejected(true);
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
        setLoading(false);
      }
    }
  }

  if (!hasToken || tokenRejected) {
    return (
      <div className="space-y-6 text-center" data-testid="accept-invite-expired-card">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-warning/12">
          <Icon name="clock" size={26} className="text-warning" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">Invitation expired</h1>
          <p className="text-sm text-muted-foreground">
            This invitation link has expired or already been used. Ask an account owner to send you a fresh invite.
          </p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          data-testid="accept-invite-back-link"
        >
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="accept-invite-form-card">
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold tracking-tight">Accept your invitation</h1>
        <p className="text-sm text-muted-foreground">Set your name and a password to join your team on Postpin.</p>
      </div>

      {error && (
        <Alert variant="destructive" data-testid="accept-invite-error-alert">
          <Icon name="shield" size={16} />
          <AlertTitle>Couldn&apos;t accept the invite</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="accept-name">Full name</Label>
          <Input
            id="accept-name"
            autoComplete="name"
            placeholder="Priya Nair"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            data-testid="accept-invite-name-input"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="accept-password">Password</Label>
          <div className="relative">
            <Input
              id="accept-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="pr-10"
              data-testid="accept-invite-password-input"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="group absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={showPassword ? "Hide password" : "Show password"}
              data-testid="accept-invite-password-toggle"
            >
              <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
            </button>
          </div>

          {password.length > 0 && (
            <div className="space-y-2" data-testid="accept-invite-strength-meter">
              <Progress value={strength.pct} indicatorClassName={strength.color} className="h-1.5" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Password strength</span>
                <span className="font-medium text-foreground">{strength.label}</span>
              </div>
              <ul className="grid grid-cols-2 gap-1.5">
                {reqs.map((r) => (
                  <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-success" : "text-muted-foreground"}`}>
                    <Icon name={r.ok ? "checkCircle" : "check"} size={13} />
                    {r.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="accept-confirm">Confirm password</Label>
          <Input
            id="accept-confirm"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={loading}
            aria-invalid={confirm.length > 0 && confirm !== password}
            data-testid="accept-invite-confirm-input"
          />
          {confirm.length > 0 && confirm !== password && <p className="text-xs text-destructive">Passwords don&apos;t match.</p>}
        </div>

        <Button type="submit" variant="gradient" size="lg" className="group w-full" disabled={loading} data-testid="accept-invite-submit-btn">
          {loading ? (
            <>
              <Icon name="sync" size={16} className="text-white" /> Joining…
            </>
          ) : (
            <>
              Join the team
              <Icon name="arrowRight" size={16} className="text-white" />
            </>
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline" data-testid="accept-invite-login-link">
          Back to log in
        </Link>
      </p>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <React.Suspense fallback={null}>
      <AcceptInviteForm />
    </React.Suspense>
  );
}
