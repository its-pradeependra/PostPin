import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Sleep helper for simulating async mock calls. */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deterministic pseudo-random generator (seeded) so charts/data are stable across renders. */
export function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Generate a random-looking API key (mock only). */
export function generateApiKey(prefix = "pk_live") {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let body = "";
  for (let i = 0; i < 32; i++) {
    body += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}_${body}`;
}

/** Mask an API key, showing only the prefix and last 4 chars. */
export function maskKey(key: string) {
  const parts = key.split("_");
  const tail = key.slice(-4);
  const head = parts.slice(0, 2).join("_");
  return `${head}_${"•".repeat(18)}${tail}`;
}

/** Build initials from a name. */
export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
}

/** Slugify a string. */
export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
