"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { resendVerification, verifyEmail } from "@/lib/api/services/auth";

type Status = "check-inbox" | "verifying" | "verified" | "error";

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const email = params.get("email");

  const [status, setStatus] = React.useState<Status>(token ? "verifying" : "check-inbox");
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyEmail(token)
      .then(() => {
        if (cancelled) return;
        setStatus("verified");
        toast.success("Email verified", { description: "Log in to continue." });
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  async function handleResend() {
    if (cooldown > 0 || !email) return;
    setCooldown(60);
    try {
      await resendVerification(email);
    } catch {
      /* non-enumerating */
    }
    toast.success("Verification email sent", { description: "Check your inbox for the new link." });
  }

  if (status === "verifying") {
    return (
      <div className="space-y-6 text-center" data-testid="verify-verifying-card">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-gradient-soft">
          <Icon name="sync" trigger="loop" size={26} className="text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">Verifying your email…</h1>
          <p className="text-sm text-muted-foreground">Hang tight while we confirm your email address.</p>
        </div>
      </div>
    );
  }

  if (status === "check-inbox") {
    return (
      <div className="space-y-6 text-center" data-testid="verify-check-inbox-card">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-gradient-soft">
          <Icon name="mail" trigger="loop" animation="float" size={26} className="text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">Check your inbox</h1>
          <p className="text-sm text-muted-foreground">
            We sent a verification link to{" "}
            {email ? <span className="font-mono text-foreground">{email}</span> : "your email"}. Click it to
            activate your account.
          </p>
        </div>
        {email && (
          <Button
            type="button"
            variant="outline"
            className="group w-full"
            onClick={handleResend}
            disabled={cooldown > 0}
            data-testid="verify-resend-btn"
          >
            <Icon name="mail" trigger="group-hover" size={16} />
            {cooldown > 0 ? `Resend in 0:${String(cooldown).padStart(2, "0")}` : "Resend verification email"}
          </Button>
        )}
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          data-testid="verify-login-link"
        >
          Back to log in
        </Link>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="space-y-6 text-center" data-testid="verify-error-card">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-warning/12">
          <Icon name="clock" trigger="loop" animation="pulse" size={26} className="text-warning" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">Link expired</h1>
          <p className="text-sm text-muted-foreground">
            This verification link is invalid or has expired. Request a new one and we&apos;ll email it right away.
          </p>
        </div>
        <Button
          type="button"
          variant="gradient"
          size="lg"
          className="group w-full"
          onClick={handleResend}
          disabled={cooldown > 0 || !email}
          data-testid="verify-resend-btn"
        >
          <Icon name="mail" trigger="group-hover" size={16} className="text-white" />
          {cooldown > 0 ? `Resend in 0:${String(cooldown).padStart(2, "0")}` : "Resend verification email"}
        </Button>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          data-testid="verify-login-link"
        >
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-center" data-testid="verify-verified-card">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-success/12">
        <Icon name="checkCircle" trigger="mount" size={28} className="text-success" />
      </div>
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold tracking-tight">Email verified</h1>
        <p className="text-sm text-muted-foreground">
          Your email is confirmed. Log in to start pricing parcels.
        </p>
      </div>

      <Button
        type="button"
        variant="gradient"
        size="lg"
        className="group w-full"
        onClick={() => router.push(`/login${email ? `?email=${encodeURIComponent(email)}` : ""}`)}
        data-testid="verify-continue-btn"
      >
        Continue to log in
        <Icon name="arrowRight" trigger="group-hover" size={16} className="text-white" />
      </Button>

      <Button asChild variant="ghost" className="group w-full" data-testid="verify-docs-btn">
        <Link href="/docs">
          <Icon name="book" trigger="group-hover" size={16} /> Read the quickstart
        </Link>
      </Button>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense fallback={null}>
      <VerifyEmailForm />
    </React.Suspense>
  );
}
