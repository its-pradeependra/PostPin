"use client";

import { useCookieConsent } from "@/components/providers/cookie-consent";

/** Footer link that re-opens the cookie banner so visitors can change their
 * choice at any time (a GDPR requirement — consent must be revocable). */
export function CookiePreferencesLink() {
  const { openPreferences } = useCookieConsent();
  return (
    <button
      type="button"
      onClick={openPreferences}
      data-testid="footer-cookie-preferences"
      className="text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
    >
      Cookie preferences
    </button>
  );
}
