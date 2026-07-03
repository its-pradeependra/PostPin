import { buildApp } from "@/app.js";
import { env } from "@/config/env.js";
import { connectDb } from "@/lib/db.js";
import { initJwt } from "@/lib/jwt.js";
import { logger } from "@/lib/logger.js";
import { connectRedis } from "@/lib/redis.js";
import { assertScoped, registerIndexes } from "@/models/index.js";
import { startPincodeSyncScheduler } from "@/services/pincode-sync.service.js";

async function main() {
  await initJwt();

  // Code-level tenant-isolation invariant — fail fast if any scoped model lost its companyId index.
  assertScoped();

  try {
    await connectDb();
    await registerIndexes();
    await connectRedis();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "MongoDB unavailable at boot — continuing; /health will report disconnected");
  }

  const app = await buildApp();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  logger.info(`Postpin API listening on http://localhost:${env.PORT}`);

  // Nightly India Post directory sync (no-op when DATA_GOV_IN_API_KEY is absent).
  startPincodeSyncScheduler();

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      logger.info(`${signal} received — shutting down`);
      await app.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.error({ err }, "Fatal boot error");
  process.exit(1);
});
