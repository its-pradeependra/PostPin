/** Locale-aware formatting helpers (default to en-IN / INR for an India-first product). */

export function formatCurrency(
  amount: number,
  currency: "INR" | "USD" = "INR",
  opts: Intl.NumberFormatOptions = {},
) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    ...opts,
  }).format(amount);
}

export function formatNumber(value: number, opts: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat("en-IN", opts).format(value);
}

/** Compact number formatting: 12500 -> 12.5K, 1200000 -> 1.2M */
export function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number, fractionDigits = 1) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatDate(
  input: string | number | Date,
  style: "short" | "medium" | "long" = "medium",
) {
  const date = new Date(input);
  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "2-digit", month: "short" }
      : style === "long"
        ? { day: "numeric", month: "long", year: "numeric" }
        : { day: "2-digit", month: "short", year: "numeric" };
  return new Intl.DateTimeFormat("en-IN", options).format(date);
}

export function formatDateTime(input: string | number | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(input));
}

/** "3 hours ago", "2 days ago", "just now" */
export function formatRelativeTime(input: string | number | Date) {
  const date = new Date(input);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (abs < minute) return "just now";
  if (abs < hour) return rtf.format(Math.round(diff / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  if (abs < week) return rtf.format(Math.round(diff / day), "day");
  if (abs < month) return rtf.format(Math.round(diff / week), "week");
  if (abs < year) return rtf.format(Math.round(diff / month), "month");
  return rtf.format(Math.round(diff / year), "year");
}

export function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Latency in ms with a unit. */
export function formatLatency(ms: number) {
  if (ms < 1) return "<1 ms";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${Math.round(ms)} ms`;
}
