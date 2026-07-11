"use client";

import { trackEvent } from "@/lib/analytics";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icon } from "@/components/icons";
import { getPublicPlans } from "@/lib/api/services/public";
import { formatCurrency } from "@/lib/format";
import { signup as apiSignup } from "@/lib/api/services/auth";
import { useRedirectIfAuthenticated } from "@/components/providers/session-provider";
import { ApiError } from "@/lib/api/errors";

type Requirement = { label: string; ok: boolean };

function scorePassword(pw: string): { score: number; reqs: Requirement[] } {
  const reqs: Requirement[] = [
    { label: "At least 12 characters", ok: pw.length >= 12 },
    { label: "Upper & lower case", ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { label: "A number", ok: /\d/.test(pw) },
    { label: "A symbol", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  const score = reqs.filter((r) => r.ok).length;
  return { score, reqs };
}

const STRENGTH_META = [
  { label: "Too weak", color: "bg-destructive", pct: 12 },
  { label: "Weak", color: "bg-destructive", pct: 35 },
  { label: "Fair", color: "bg-warning", pct: 60 },
  { label: "Good", color: "bg-info", pct: 82 },
  { label: "Strong", color: "bg-success", pct: 100 },
] as const;

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();

  // Already signed in? Signup is guest-only — go to the dashboard.
  useRedirectIfAuthenticated();
  const planSlug = params.get("plan");
  // Fetch public plans only when a ?plan= param is present (the chip is the sole consumer).
  const plansQ = useQuery({ queryKey: ["public", "plans"], queryFn: getPublicPlans, enabled: !!planSlug });
  const selectedPlan = React.useMemo(() => {
    if (!planSlug || !plansQ.data) return undefined;
    const match = plansQ.data.find(
      (p) => p.code === planSlug || p.name.toLowerCase() === planSlug.toLowerCase(),
    );
    if (!match) return undefined;
    return {
      name: match.name,
      priceMonthly: match.price_monthly_paise < 0 ? -1 : match.price_monthly_paise / 100,
    };
  }, [planSlug, plansQ.data]);

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [consent, setConsent] = React.useState(false);
  // Opt-in must be a deliberate action — default OFF (never pre-ticked).
  const [marketing, setMarketing] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { score, reqs } = scorePassword(password);
  const strength = STRENGTH_META[score];
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) return setError("Please enter your full name.");
    if (!emailValid) return setError("Enter a valid work email address.");
    if (company.trim().length < 2) return setError("Please enter your company name.");
    if (password.length < 12 || score < 3)
      return setError("Choose a stronger password — meet at least three requirements.");
    if (!consent) return setError("Please accept the Terms and Privacy Policy to continue.");

    setLoading(true);
    try {
      await apiSignup({ email, password, name, company_name: company, marketing_consent: marketing });
      trackEvent("sign_up", { method: "email" });
      toast.success("Account created", { description: "Check your inbox to verify your email." });
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_taken") {
        setError("An account with this email already exists. Try logging in instead.");
      } else {
        setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      }
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="signup-form-card">
      <div className="space-y-2 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Start with 1,000 free calls/month. No credit card required.
        </p>
      </div>

      {selectedPlan && (
        <div
          className="flex items-center justify-between rounded-xl border border-border bg-accent px-3 py-2 text-sm"
          data-testid="signup-plan-chip"
        >
          <span className="flex items-center gap-2">
            <Icon name="rocket" size={16} className="text-primary" />
            <span className="font-medium text-accent-foreground">{selectedPlan.name}</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {selectedPlan.priceMonthly < 0 ? "Custom" : `${formatCurrency(selectedPlan.priceMonthly)}/mo`}
            </span>
          </span>
          <Link
            href="/pricing"
            className="text-xs font-medium text-primary hover:underline"
            data-testid="signup-plan-change-link"
          >
            change
          </Link>
        </div>
      )}

      {error && (
        <Alert variant="destructive" data-testid="signup-error-alert">
          <Icon name="shield" size={16} />
          <AlertTitle>Couldn&apos;t create your account</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="signup-name">Full name</Label>
          <Input
            id="signup-name"
            autoComplete="name"
            placeholder="Aarav Sharma"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            data-testid="signup-name-input"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signup-email">Work email</Label>
          <Input
            id="signup-email"
            type="email"
            autoComplete="email"
            placeholder="you@company.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            data-testid="signup-email-input"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signup-company">Company</Label>
          <Input
            id="signup-company"
            autoComplete="organization"
            placeholder="Acme Logistics"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={loading}
            data-testid="signup-company-input"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-password">Password</Label>
          <div className="relative">
            <Input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="pr-10"
              data-testid="signup-password-input"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="group absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={showPassword ? "Hide password" : "Show password"}
              data-testid="signup-password-toggle"
            >
              <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
            </button>
          </div>

          {password.length > 0 && (
            <div className="space-y-2" data-testid="signup-strength-meter">
              <Progress
                value={strength.pct}
                indicatorClassName={strength.color}
                className="h-1.5"
              />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Password strength</span>
                <span className="font-medium text-foreground">{strength.label}</span>
              </div>
              <ul className="grid grid-cols-2 gap-1.5">
                {reqs.map((r) => (
                  <li
                    key={r.label}
                    className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-success" : "text-muted-foreground"}`}
                    data-testid={`signup-req-${r.label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}`}
                  >
                    <Icon name={r.ok ? "checkCircle" : "check"} size={13} />
                    {r.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="signup-consent"
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
            disabled={loading}
            className="mt-0.5"
            data-testid="signup-consent-checkbox"
          />
          <Label htmlFor="signup-consent" className="block text-sm font-normal leading-snug text-muted-foreground">
            I agree to the{" "}
            <Link href="/legal/terms" className="text-primary hover:underline">Terms</Link> and{" "}
            <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
          </Label>
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="signup-marketing"
            checked={marketing}
            onCheckedChange={(v) => setMarketing(v === true)}
            disabled={loading}
            className="mt-0.5"
            data-testid="signup-marketing-checkbox"
          />
          <Label htmlFor="signup-marketing" className="block text-sm font-normal leading-snug text-muted-foreground">
            Send me product updates and shipping insights{" "}
            <Badge variant="muted" className="ml-1 align-middle">optional</Badge>
          </Label>
        </div>

        <Button
          type="submit"
          variant="gradient"
          size="lg"
          className="group w-full"
          disabled={loading}
          data-testid="signup-submit-btn"
        >
          {loading ? (
            <>
              <Icon name="sync" size={16} className="text-white" /> Creating account…
            </>
          ) : (
            <>
              Create account
              <Icon name="arrowRight" size={16} className="text-white" />
            </>
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline" data-testid="signup-login-link">
          Log in
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <React.Suspense fallback={null}>
      <SignupForm />
    </React.Suspense>
  );
}
