"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon } from "@/components/icons";
import { forgotPassword as apiForgot } from "@/lib/api/services/auth";

function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const head = user.slice(0, 1);
  return `${head}${"•".repeat(Math.max(user.length - 1, 1))}@${domain}`;
}

function ForgotForm() {
  const params = useSearchParams();
  const [email, setEmail] = React.useState(params.get("email") || "");
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  async function send() {
    setError(null);
    if (!emailValid) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      await apiForgot(email); // always succeeds (non-enumerating)
    } catch {
      /* ignore */
    }
    setLoading(false);
    setSent(true);
    setCooldown(60);
    toast.success("Reset link sent", { description: "Check your inbox for the next step." });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send();
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setCooldown(60);
    try {
      await apiForgot(email);
    } catch {
      /* ignore */
    }
    toast.success("Reset link sent again", { description: "It can take a minute to arrive." });
  }

  if (sent) {
    return (
      <div className="space-y-6 text-center" data-testid="forgot-sent-card">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-gradient-soft">
          <Icon name="mail" size={26} className="text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            If an account exists for{" "}
            <span className="font-mono text-foreground">{maskEmail(email)}</span>, a reset link is on its way.
          </p>
        </div>

        <div className="space-y-3 text-left">
          <Button
            type="button"
            variant="outline"
            className="group w-full"
            onClick={handleResend}
            disabled={cooldown > 0}
            data-testid="forgot-resend-btn"
          >
            <Icon name="sync" size={16} />
            {cooldown > 0 ? `Resend in 0:${String(cooldown).padStart(2, "0")}` : "Resend link"}
          </Button>
          <Button asChild variant="ghost" className="group w-full" data-testid="forgot-open-mail-btn">
            <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={16} /> Open your email app
            </a>
          </Button>
        </div>

        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          data-testid="forgot-back-link"
        >
          <Icon name="arrowRight" size={14} className="rotate-180" /> Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="forgot-form-card">
      <Link
        href="/login"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        data-testid="forgot-back-link"
      >
        <Icon name="arrowRight" size={14} className="rotate-180" /> Back to log in
      </Link>

      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold tracking-tight">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a link to reset it.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" data-testid="forgot-error-alert">
          <Icon name="shield" size={16} />
          <AlertTitle>Couldn&apos;t send the link</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="forgot-email">Email</Label>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            placeholder="you@company.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            data-testid="forgot-email-input"
          />
        </div>

        <Button
          type="submit"
          variant="gradient"
          size="lg"
          className="group w-full"
          disabled={loading}
          data-testid="forgot-submit-btn"
        >
          {loading ? (
            <>
              <Icon name="sync" size={16} className="text-white" /> Sending…
            </>
          ) : (
            <>
              Send reset link
              <Icon name="send" size={16} className="text-white" />
            </>
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline" data-testid="forgot-login-link">
          Log in
        </Link>
      </p>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <ForgotForm />
    </React.Suspense>
  );
}
