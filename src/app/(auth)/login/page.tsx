"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/providers/session-provider";
import { login as apiLogin } from "@/lib/api/services/auth";
import { ApiError } from "@/lib/api/errors";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const { refresh } = useSession();

  const [email, setEmail] = React.useState(params.get("email") || "");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [remember, setRemember] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!emailValid) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setLoading(true);
    try {
      const user = await apiLogin(email, password);
      await refresh();
      toast.success("Logged in", { description: "Welcome back to Postpin." });
      // Platform staff land in the admin portal; tenants in the app (unless a
      // deep-link ?next= was requested).
      router.push(next || (user.isPlatformStaff ? "/admin" : "/app"));
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_unverified") {
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      if (err instanceof ApiError && err.code === "account_locked") {
        setError("Too many attempts — this account is temporarily locked. Try again in a few minutes.");
      } else if (err instanceof ApiError && err.status === 401) {
        setError("Email or password is incorrect.");
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      }
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="login-form-card">
      <div className="space-y-2 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Log in to your Postpin account to manage keys, usage and billing.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" data-testid="login-error-alert">
          <Icon name="shield" size={16} />
          <AlertTitle>Couldn&apos;t sign you in</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@company.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            data-testid="login-email-input"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary hover:underline"
              data-testid="login-forgot-link"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="pr-10"
              data-testid="login-password-input"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="group absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={showPassword ? "Hide password" : "Show password"}
              data-testid="login-password-toggle"
            >
              <Icon name={showPassword ? "eyeOff" : "eye"} trigger="group-hover" size={16} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="login-remember"
            checked={remember}
            onCheckedChange={(v) => setRemember(v === true)}
            disabled={loading}
            data-testid="login-remember-checkbox"
          />
          <Label htmlFor="login-remember" className="text-sm font-normal text-muted-foreground">
            Remember me for 30 days
          </Label>
        </div>

        <Button
          type="submit"
          variant="gradient"
          size="lg"
          className="group w-full"
          disabled={loading}
          data-testid="login-submit-btn"
        >
          {loading ? (
            <>
              <Icon name="sync" trigger="loop" size={16} className="text-white" /> Logging in…
            </>
          ) : (
            <>
              Log in
              <Icon name="arrowRight" trigger="group-hover" size={16} className="text-white" />
            </>
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        New to Postpin?{" "}
        <Link
          href="/signup"
          className="font-medium text-primary hover:underline"
          data-testid="login-create-account-link"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  );
}
