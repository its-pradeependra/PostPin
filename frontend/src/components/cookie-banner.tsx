"use client";

import * as React from "react";
import Link from "next/link";
import { useCookieConsent } from "@/components/providers/cookie-consent";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";

/**
 * Floating cookie-consent card, anchored bottom-center with breathing room on
 * every side. Non-blocking; no non-essential script loads until a choice is
 * made. "Reject" and "Accept" carry equal visual weight (GDPR-friendly).
 */
export function CookieBanner() {
  const { bannerOpen, acceptAll, rejectAll, save, consent } = useCookieConsent();
  const [customizing, setCustomizing] = React.useState(false);
  const [analytics, setAnalytics] = React.useState(consent.analytics);
  const [marketing, setMarketing] = React.useState(consent.marketing);

  React.useEffect(() => {
    setAnalytics(consent.analytics);
    setMarketing(consent.marketing);
    if (!bannerOpen) setCustomizing(false);
  }, [consent, bannerOpen]);

  if (!bannerOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      data-testid="cookie-banner"
      className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-3xl animate-in fade-in-0 slide-in-from-bottom-4 duration-300 ease-out motion-reduce:animate-none sm:inset-x-6 sm:bottom-6"
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/10 dark:shadow-black/40">
        {/* Header + copy */}
        <div className="flex gap-3.5 p-5 pb-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon name="shield" size={19} />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold leading-6">We value your privacy</p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Essential cookies keep Postpin running (sign-in, security). With your consent we also
              use analytics to understand usage — nothing non-essential loads until you choose.{" "}
              <Link
                href="/legal/privacy"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>

        {/* Customize panel (expands in place) */}
        {customizing && (
          <div className="space-y-2 border-t border-border bg-muted/30 px-5 py-4" data-testid="cookie-customize-panel">
            <PrefRow
              title="Strictly necessary"
              desc="Sign-in, security and this choice. Always on."
            >
              <Switch checked disabled aria-label="Necessary cookies (always on)" data-testid="cookie-necessary-switch" />
            </PrefRow>
            <PrefRow title="Analytics" desc="Google Analytics — anonymous usage stats.">
              <Switch checked={analytics} onCheckedChange={setAnalytics} data-testid="cookie-analytics-switch" />
            </PrefRow>
            <PrefRow title="Marketing" desc="Ad / remarketing pixels. None are active today.">
              <Switch checked={marketing} onCheckedChange={setMarketing} data-testid="cookie-marketing-switch" />
            </PrefRow>
          </div>
        )}

        {/* Actions — one aligned row (stacked full-width on small screens) */}
        <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center">
          {customizing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCustomizing(false)}
                className="text-muted-foreground sm:mr-auto"
                data-testid="cookie-customize-btn"
              >
                <Icon name="chevronDown" size={15} className="rotate-90" />
                Back
              </Button>
              <Button variant="outline" size="sm" onClick={rejectAll} data-testid="cookie-reject-btn">
                Reject non-essential
              </Button>
              <Button
                variant="gradient"
                size="sm"
                onClick={() => save({ necessary: true, analytics, marketing })}
                data-testid="cookie-save-btn"
              >
                Save preferences
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCustomizing(true)}
                className="text-muted-foreground sm:mr-auto"
                data-testid="cookie-customize-btn"
              >
                Customize
              </Button>
              <Button variant="outline" size="sm" onClick={rejectAll} data-testid="cookie-reject-btn">
                Reject non-essential
              </Button>
              <Button variant="gradient" size="sm" onClick={acceptAll} data-testid="cookie-accept-btn">
                Accept all
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PrefRow({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-3.5 py-2.5">
      <div className="min-w-0">
        <Label className="text-[13px] font-medium leading-5">{title}</Label>
        <p className="truncate text-xs leading-5 text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  );
}
