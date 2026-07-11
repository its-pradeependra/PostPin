/**
 * Custom GA4 events. `gtag` only exists when the visitor accepted analytics
 * cookies (the GA script is consent-gated), so every call here automatically
 * respects consent — it silently no-ops otherwise (dev, rejected, SSR).
 *
 * Event names follow GA4 recommended events where one exists
 * (sign_up, login, generate_lead, purchase) so GA4's built-in reports
 * light up without extra configuration.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type EventParams = Record<string, string | number | boolean | undefined>;

export function trackEvent(name: string, params?: EventParams): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", name, params ?? {});
  } catch {
    /* analytics must never break the app */
  }
}
