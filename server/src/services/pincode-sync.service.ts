import { env, isTest } from "@/config/env.js";
import { logger } from "@/lib/logger.js";
import { PincodeModel, PincodeSyncLogModel, SettingsModel } from "@/models/index.js";
import { writeAudit } from "@/services/audit.service.js";
import type { Types } from "mongoose";

/** Nightly live sync against the official data.gov.in All India Pincode
 * Directory (Department of Posts). Runs in-process (no queue dependency);
 * failures surface via pincodeSyncLogs + the admin dashboard alert card. */

const API_BASE = "https://api.data.gov.in/resource";
const PAGE_SIZE = 10_000;
const BATCH = 1000;

const METRO_DISTRICTS = new Set([
  "new delhi", "central delhi", "east delhi", "north delhi", "south delhi", "west delhi",
  "north east delhi", "north west delhi", "south east delhi", "south west delhi", "shahdara", "delhi",
  "mumbai", "mumbai city", "mumbai suburban", "thane",
  "kolkata", "chennai", "bangalore", "bengaluru", "bengaluru urban", "bangalore urban",
  "hyderabad", "ahmedabad", "ahmadabad", "pune",
]);
const REMOTE_STATES = new Set([
  "arunachal pradesh", "assam", "manipur", "meghalaya", "mizoram", "nagaland", "tripura", "sikkim",
  "jammu and kashmir", "jammu & kashmir", "ladakh", "andaman and nicobar islands", "andaman & nicobar islands", "lakshadweep",
]);

export interface DirectoryRecord {
  officename?: string;
  pincode?: string | number;
  officetype?: string;
  district?: string;
  statename?: string;
  latitude?: string | number;
  longitude?: string | number;
}

const titleCase = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
const officeRank = (t: string) => (/HO/i.test(t) ? 3 : /SO/i.test(t) ? 2 : 1);

interface CanonicalPin {
  rank: number;
  officeName: string;
  district: string;
  state: string;
  city: string;
  isMetro: boolean;
  isRemote: boolean;
  lat: number | null;
  lng: number | null;
}

/** Collapse office rows to one canonical row per pincode (HO > SO > BO). */
export function dedupeDirectory(records: DirectoryRecord[], into: Map<string, CanonicalPin> = new Map()) {
  for (const r of records) {
    const pin = String(r.pincode ?? "").trim();
    if (!/^\d{6}$/.test(pin)) continue;
    const rank = officeRank(String(r.officetype ?? ""));
    const existing = into.get(pin);
    if (existing && rank <= existing.rank) continue;
    const district = titleCase(r.district);
    const state = titleCase(r.statename);
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    into.set(pin, {
      rank,
      officeName: String(r.officename ?? "").replace(/\s*(B\.?O|S\.?O|H\.?O)\.?\s*$/i, "").trim(),
      district,
      state,
      city: district,
      isMetro: METRO_DISTRICTS.has(district.toLowerCase()),
      isRemote: REMOTE_STATES.has(state.toLowerCase()),
      lat: Number.isFinite(lat) && lat !== 0 ? lat : null,
      lng: Number.isFinite(lng) && lng !== 0 ? lng : null,
    });
  }
  return into;
}

/** Upsert canonical rows in bulk. Returns counts. */
export async function applyDirectory(byPin: Map<string, CanonicalPin>, syncLogId: Types.ObjectId) {
  const counts = { scanned: byPin.size, added: 0, updated: 0, removed: 0, failed: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ops: any[] = [];
  const flush = async () => {
    if (ops.length === 0) return;
    const res = await PincodeModel.bulkWrite(ops, { ordered: false });
    counts.added += res.upsertedCount ?? 0;
    counts.updated += res.modifiedCount ?? 0;
    ops = [];
  };
  for (const [pincode, v] of byPin) {
    ops.push({
      updateOne: {
        filter: { pincode },
        update: {
          $set: {
            officeName: v.officeName,
            district: v.district,
            state: v.state,
            city: v.city,
            isMetro: v.isMetro,
            isRemote: v.isRemote,
            lat: v.lat,
            lng: v.lng,
            status: "active",
            source: "india_post",
            lastSyncId: syncLogId,
          },
          $setOnInsert: { pincode },
        },
        upsert: true,
      },
    });
    if (ops.length >= BATCH) await flush();
  }
  await flush();
  return counts;
}

async function fetchPage(offset: number): Promise<{ records: DirectoryRecord[]; total: number }> {
  const url = `${API_BASE}/${env.DATA_GOV_IN_PINCODE_RESOURCE}?api-key=${env.DATA_GOV_IN_API_KEY}&format=json&limit=${PAGE_SIZE}&offset=${offset}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`data.gov.in HTTP ${res.status}`);
      const j = (await res.json()) as { records?: DirectoryRecord[]; total?: number };
      return { records: j.records ?? [], total: Number(j.total ?? 0) };
    } catch (e) {
      if (attempt === 4) throw e;
      await new Promise((r) => setTimeout(r, (isTest ? 1 : 3000) * attempt));
    }
  }
  return { records: [], total: 0 };
}

/** A `running` log older than this is treated as a dead lock (crashed process),
 * so a stale run can never permanently block new syncs. */
const STALE_RUNNING_MS = 15 * 60_000;

/** Durable sync status (survives the fire-and-forget request). The UI polls this
 * to disable the trigger and reflect progress until the run finishes/fails. */
export async function getSyncStatus() {
  const running = await PincodeSyncLogModel.findOne({ status: "running" }).sort({ startedAt: -1 }).lean();
  const fresh = running ? Date.now() - new Date(running.startedAt).getTime() < STALE_RUNNING_MS : false;
  const last = await PincodeSyncLogModel.findOne({ status: { $in: ["success", "failed", "rolled_back"] } })
    .sort({ startedAt: -1 })
    .lean();
  return {
    running: fresh,
    current: fresh && running
      ? { id: String(running._id), trigger: running.trigger, source: running.source, started_at: running.startedAt }
      : null,
    last: last
      ? {
          id: String(last._id),
          trigger: last.trigger,
          status: last.status,
          started_at: last.startedAt,
          ended_at: last.endedAt,
          duration_ms: last.durationMs,
          counts: last.counts,
          error: last.error,
        }
      : null,
  };
}

let syncInFlight = false;

/** Full live sync run. Safe without a request context (cron path). */
export async function runLiveSync(trigger: "cron" | "manual", triggeredByUserId?: Types.ObjectId | null) {
  if (!env.DATA_GOV_IN_API_KEY) throw new Error("DATA_GOV_IN_API_KEY not configured");
  if (syncInFlight) return { skipped: true as const, reason: "sync already running" };
  syncInFlight = true;
  const started = Date.now();
  const log = await PincodeSyncLogModel.create({
    trigger: trigger === "cron" ? "cron" : "manual",
    source: "india_post",
    status: "running",
    triggeredByUserId: triggeredByUserId ?? null,
  });
  try {
    const byPin = new Map<string, CanonicalPin>();
    const first = await fetchPage(0);
    dedupeDirectory(first.records, byPin);
    let fetched = first.records.length;
    for (let offset = PAGE_SIZE; offset < first.total; offset += PAGE_SIZE) {
      const page = await fetchPage(offset);
      if (page.records.length === 0) break;
      dedupeDirectory(page.records, byPin);
      fetched += page.records.length;
    }
    logger.info({ offices: fetched, pincodes: byPin.size }, "pincode sync: directory fetched");

    const counts = await applyDirectory(byPin, log._id);
    counts.scanned = fetched; // offices scanned, pins upserted

    log.status = "success";
    log.set("counts", counts);
    log.endedAt = new Date();
    log.durationMs = Date.now() - started;
    await log.save();
    await writeAudit({
      action: "pincode.sync",
      category: "pincode",
      resource: { kind: "pincodeSyncLog", id: String(log._id) },
      metadata: { trigger, ...counts },
    });
    return { skipped: false as const, sync_id: String(log._id), counts };
  } catch (err) {
    log.status = "failed";
    log.error = (err as Error).message;
    log.endedAt = new Date();
    log.durationMs = Date.now() - started;
    await log.save();
    await writeAudit({
      action: "pincode.sync.failed",
      category: "pincode",
      severity: "critical",
      outcome: "failure",
      resource: { kind: "pincodeSyncLog", id: String(log._id) },
      metadata: { trigger, error: (err as Error).message },
    });
    // Fan out to the configured platform alert channels (email / Slack).
    try {
      const { dispatchPlatformAlert } = await import("@/services/platform-alerts.service.js");
      await dispatchPlatformAlert({
        severity: "critical",
        event: "pincode.sync.failed",
        title: "India Post sync failed",
        body: `The ${trigger} pincode sync failed: ${(err as Error).message}`,
      });
    } catch {
      /* alert dispatch is best-effort — never masks the original failure */
    }
    logger.error({ err: (err as Error).message }, "pincode live sync failed");
    throw err;
  } finally {
    syncInFlight = false;
  }
}

/** ms until the next occurrence of HH:MM in IST (UTC+5:30). Exported for tests. */
export function msUntilNextIST(timeIST: string, now = Date.now()): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeIST.trim());
  const hh = m ? Number(m[1]) : 0;
  const mm = m ? Number(m[2]) : 30;
  const IST_OFFSET_MS = 5.5 * 3600_000;
  const nowIST = now + IST_OFFSET_MS;
  const dayStartIST = Math.floor(nowIST / 86_400_000) * 86_400_000;
  let targetIST = dayStartIST + hh * 3600_000 + mm * 60_000;
  if (targetIST <= nowIST) targetIST += 86_400_000;
  return targetIST - nowIST;
}

async function syncEnabled(): Promise<{ enabled: boolean; timeIST: string }> {
  const s = await SettingsModel.findOne({ scope: "platform", key: "pincode.sync" }).lean();
  const v = (s?.value ?? {}) as { enabled?: boolean; timeIST?: string };
  return { enabled: v.enabled !== false, timeIST: typeof v.timeIST === "string" ? v.timeIST : "00:30" };
}

/** Boot hook: schedules the nightly run; re-reads settings each cycle so time
 * changes and the enabled flag take effect without a restart. */
export function startPincodeSyncScheduler(): void {
  if (isTest || !env.DATA_GOV_IN_API_KEY) return;

  const scheduleNext = async () => {
    try {
      const { enabled, timeIST } = await syncEnabled();
      const delay = msUntilNextIST(timeIST);
      logger.info(
        { at: timeIST + " IST", in_minutes: Math.round(delay / 60_000), enabled },
        "pincode sync: nightly run scheduled",
      );
      const timer = setTimeout(async () => {
        try {
          const { enabled: stillEnabled } = await syncEnabled();
          if (stillEnabled) await runLiveSync("cron");
          else logger.info("pincode sync: skipped (disabled in settings)");
        } catch {
          // failure already logged + audited inside runLiveSync
        } finally {
          void scheduleNext();
        }
      }, delay);
      timer.unref(); // never keep the process alive just for the schedule
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "pincode sync scheduler: could not schedule (retrying in 1h)");
      const retry = setTimeout(() => void scheduleNext(), 3600_000);
      retry.unref();
    }
  };
  void scheduleNext();
}
