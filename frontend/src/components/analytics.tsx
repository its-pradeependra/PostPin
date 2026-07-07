"use client";

import Script from "next/script";
import { useCookieConsent } from "@/components/providers/cookie-consent";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-QJXXK2S5R6";
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID; // optional, e.g. "GTM-XXXXXXX"

/**
 * Google Analytics 4 (gtag.js) + optional Google Tag Manager. Loads ONLY when
 * the visitor has granted analytics consent (see CookieConsentProvider) and
 * only in production, so local dev traffic never pollutes the property and
 * non-consenting/EU visitors are never tracked.
 *
 * GA4 direct (GA_ID) is all that's needed for analytics. Set NEXT_PUBLIC_GTM_ID
 * only if you also manage other tags (ads pixels, remarketing) through GTM —
 * in that case add the GA4 tag INSIDE the GTM container instead of both here,
 * or events will be double-counted.
 */
export function GoogleAnalytics() {
  const { consent } = useCookieConsent();
  if (process.env.NODE_ENV !== "production") return null;
  if (!consent.analytics) return null; // no analytics cookie/script without consent
  return (
    <>
      {GTM_ID && (
        <>
          <Script id="gtm-init" strategy="afterInteractive">
            {`
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${GTM_ID}');
            `}
          </Script>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        </>
      )}
      {/* GA4 direct — skip if you moved the GA4 tag inside your GTM container. */}
      {GA_ID && !GTM_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}');
            `}
          </Script>
        </>
      )}
    </>
  );
}
