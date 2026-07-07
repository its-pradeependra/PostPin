"use client";

import * as React from "react";
import { QueryProvider } from "@/components/providers/query-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { CookieConsentProvider } from "@/components/providers/cookie-consent";
import { CookieBanner } from "@/components/cookie-banner";
import { GoogleAnalytics } from "@/components/analytics";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <CookieConsentProvider>
      <QueryProvider>
        <SessionProvider>{children}</SessionProvider>
      </QueryProvider>
      {/* Consent-gated: GA only loads if analytics consent is granted. */}
      <GoogleAnalytics />
      <CookieBanner />
    </CookieConsentProvider>
  );
}
