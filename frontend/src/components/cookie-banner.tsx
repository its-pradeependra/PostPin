"use client";

import * as React from "react";
import Link from "next/link";
import { useCookieConsent } from "@/components/providers/cookie-consent";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";

/** Bottom-anchored cookie consent banner. Blocks nothing visually intrusive,
 * but no non-essential cookie/script loads until the visitor chooses. */
export function CookieBanner() {
  const { bannerOpen, acceptAll, rejectAll, save, consent } = useCookieConsent();
  const [customizing, setCustomizing] = React.useState(false);
  const [analytics, setAnalytics] = React.useState(consent.analytics);
  const [marketing, setMarketing] = React.useState(consent.marketing);

  React.useEffect(() => {
    setAnalytics(consent.analytics);
    setMarketing(consent.marketing);
  }, [consent, bannerOpen]);

  if (!bannerOpen) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      data-testid="cookie-banner"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-3">
            <span className="mt-0.5 hidden shrink-0 sm:block text-primary">
              <Icon name="shield" size={20} />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold">We value your privacy</p>
              <p className="max-w-2xl text-sm text-muted-foreground">
                We use essential cookies to run Postpin (sign-in, security). With your consent we also
                use analytics cookies to understand usage. Nothing non-essential loads until you choose.{" "}
                <Link href="/legal/privacy" className="text-primary underline-offset-2 hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!customizing && (
              <Button
                variant="ghost"
                onClick={() => setCustomizing(true)}
                data-testid="cookie-customize-btn"
              >
                Customize
              </Button>
            )}
            <Button variant="outline" onClick={rejectAll} data-testid="cookie-reject-btn">
              Reject non-essential
            </Button>
            <Button variant="gradient" onClick={acceptAll} data-testid="cookie-accept-btn">
              Accept all
            </Button>
          </div>
        </div>

        {customizing && (
          <div className="mt-4 space-y-2.5 border-t border-border pt-4" data-testid="cookie-customize-panel">
            <Row
              title="Strictly necessary"
              desc="Sign-in, security and your cookie choice. Always on — the app can't run without these."
            >
              <Switch checked disabled aria-label="Necessary cookies (always on)" data-testid="cookie-necessary-switch" />
            </Row>
            <Row title="Analytics" desc="Google Analytics — anonymous usage stats that help us improve.">
              <Switch checked={analytics} onCheckedChange={setAnalytics} data-testid="cookie-analytics-switch" />
            </Row>
            <Row title="Marketing" desc="Ad / remarketing pixels. None are active today; kept here for future use.">
              <Switch checked={marketing} onCheckedChange={setMarketing} data-testid="cookie-marketing-switch" />
            </Row>
            <div className="flex justify-end pt-1">
              <Button
                variant="gradient"
                onClick={() => save({ necessary: true, analytics, marketing })}
                data-testid="cookie-save-btn"
              >
                Save preferences
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{title}</Label>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  );
}
