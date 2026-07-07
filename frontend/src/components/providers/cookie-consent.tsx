"use client";

import * as React from "react";

/**
 * Cookie-consent system. Regions like the EU/UK (GDPR/ePrivacy) require prior,
 * granular, revocable consent before setting non-essential cookies. Our system
 * therefore *gates real behavior* on the choice recorded here:
 *
 *  - Necessary   — always on. Auth (pp_rt/pp_csrf), theme, and this consent
 *                  cookie itself are strictly required for the app to work.
 *  - Analytics   — Google Analytics only loads when this is granted.
 *  - Marketing   — reserved for ad/remarketing pixels (none load until granted).
 *
 * The choice lives in a first-party cookie so it survives reloads and is
 * readable server-side later if needed. Necessary/consent cookies are exempt
 * from the consent requirement, so writing this cookie before a choice is fine.
 */

export interface CookieConsent {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
}

const COOKIE_NAME = "pp_cookie_consent";
const COOKIE_VERSION = 1;
const ONE_YEAR = 60 * 60 * 24 * 365;

const DENY_ALL: CookieConsent = { necessary: true, analytics: false, marketing: false };
const GRANT_ALL: CookieConsent = { necessary: true, analytics: true, marketing: true };

interface Ctx {
  /** Current choice (defaults to deny-all until the user decides). */
  consent: CookieConsent;
  /** Has the visitor made an explicit choice yet? */
  decided: boolean;
  /** Persist a choice (marks decided). */
  save: (next: CookieConsent) => void;
  acceptAll: () => void;
  rejectAll: () => void;
  /** Re-open the banner in customize mode (e.g. from a footer link). */
  openPreferences: () => void;
  /** Whether the banner/preferences panel should be visible. */
  bannerOpen: boolean;
  setBannerOpen: (v: boolean) => void;
}

const CookieConsentContext = React.createContext<Ctx | null>(null);

function readCookie(): { consent: CookieConsent; decided: boolean } {
  if (typeof document === "undefined") return { consent: DENY_ALL, decided: false };
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!raw) return { consent: DENY_ALL, decided: false };
  try {
    const parsed = JSON.parse(decodeURIComponent(raw.split("=").slice(1).join("=")));
    if (parsed?.v !== COOKIE_VERSION) return { consent: DENY_ALL, decided: false };
    return {
      consent: { necessary: true, analytics: Boolean(parsed.analytics), marketing: Boolean(parsed.marketing) },
      decided: true,
    };
  } catch {
    return { consent: DENY_ALL, decided: false };
  }
}

function writeCookie(consent: CookieConsent) {
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  const value = encodeURIComponent(JSON.stringify({ v: COOKIE_VERSION, analytics: consent.analytics, marketing: consent.marketing, ts: Date.now() }));
  document.cookie = `${COOKIE_NAME}=${value}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax${secure}`;
}

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = React.useState<CookieConsent>(DENY_ALL);
  const [decided, setDecided] = React.useState(true); // assume decided during SSR → banner never flashes for returning users
  const [bannerOpen, setBannerOpen] = React.useState(false);

  // Hydrate from the cookie on mount (client only).
  React.useEffect(() => {
    const { consent: c, decided: d } = readCookie();
    setConsent(c);
    setDecided(d);
    setBannerOpen(!d);
  }, []);

  const save = React.useCallback((next: CookieConsent) => {
    writeCookie(next);
    setConsent(next);
    setDecided(true);
    setBannerOpen(false);
  }, []);

  const value: Ctx = {
    consent,
    decided,
    save,
    acceptAll: () => save(GRANT_ALL),
    rejectAll: () => save(DENY_ALL),
    openPreferences: () => setBannerOpen(true),
    bannerOpen,
    setBannerOpen,
  };

  return <CookieConsentContext.Provider value={value}>{children}</CookieConsentContext.Provider>;
}

export function useCookieConsent(): Ctx {
  const ctx = React.useContext(CookieConsentContext);
  if (!ctx) throw new Error("useCookieConsent must be used within <CookieConsentProvider>");
  return ctx;
}
