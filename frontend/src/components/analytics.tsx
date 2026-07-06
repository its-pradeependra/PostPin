import Script from "next/script";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-QJXXK2S5R6";

/**
 * Google Analytics 4 (gtag.js). Loads after hydration on every page; GA4's
 * enhanced measurement tracks SPA route changes automatically. Rendered only
 * in production so local dev traffic never pollutes the property.
 */
export function GoogleAnalytics() {
  if (process.env.NODE_ENV !== "production" || !GA_ID) return null;
  return (
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
  );
}
