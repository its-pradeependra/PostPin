import "dotenv/config";
import { connectDb, disconnectDb } from "@/lib/db.js";
import { logger } from "@/lib/logger.js";
import { ApiKeyModel, ApiLogModel } from "@/models/index.js";

/**
 * One-time reconciliation: recompute each API key's `requestCount` + `lastUsedAt`
 * from the request logs (apiLogs). Needed because a lazy-Mongoose bug meant
 * `requestCount` didn't increment for calls made before that fix shipped — but
 * apiLogs recorded them all, so we can restore the true per-key totals here.
 *
 * SET (not add), so it's idempotent — safe to run more than once. Note apiLogs
 * carry a 90-day TTL, so on an older account this reflects calls within the
 * retained window; on a fresh launch it's the exact lifetime total.
 *
 * Run on the server:  cd server && pnpm run backfill-key-usage
 */
export async function reconcileKeyUsage(): Promise<{ keys: number; updated: number; unchanged: number }> {
  // One pass over the logs: count + newest timestamp per key.
  const rows = (await ApiLogModel.aggregate([
    { $group: { _id: "$apiKeyId", count: { $sum: 1 }, lastAt: { $max: "$createdAt" } } },
  ])) as Array<{ _id: unknown; count: number; lastAt: Date }>;

  const byKey = new Map(rows.filter((r) => r._id).map((r) => [String(r._id), r]));

  const keys = await ApiKeyModel.find().select("_id name requestCount").lean();
  let updated = 0;
  let unchanged = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: any[] = [];
  for (const key of keys) {
    const stat = byKey.get(String(key._id));
    const trueCount = stat?.count ?? 0;
    const current = (key as { requestCount?: number }).requestCount ?? 0;
    if (trueCount === current) {
      unchanged++;
      continue;
    }
    ops.push({
      updateOne: {
        filter: { _id: key._id },
        update: { $set: { requestCount: trueCount, ...(stat?.lastAt ? { lastUsedAt: stat.lastAt } : {}) } },
      },
    });
    logger.info({ key: key.name, from: current, to: trueCount }, "reconcile key requestCount");
    updated++;
  }

  if (ops.length > 0) await ApiKeyModel.bulkWrite(ops, { ordered: false });
  return { keys: keys.length, updated, unchanged };
}

async function main() {
  await connectDb();
  const summary = await reconcileKeyUsage();
  logger.info(summary, "key-usage backfill complete");
  await disconnectDb();
  process.exit(0);
}

// Only run when invoked directly (not when imported by a test).
if (process.argv[1] && process.argv[1].endsWith("backfill-key-usage.ts")) {
  main().catch(async (err) => {
    logger.error({ err }, "key-usage backfill failed");
    await disconnectDb();
    process.exit(1);
  });
}
