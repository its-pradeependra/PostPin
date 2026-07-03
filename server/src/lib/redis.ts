import { Redis } from "ioredis";
import { env, isTest } from "@/config/env.js";
import { logger } from "@/lib/logger.js";

let client: Redis | null = null;
let ready = false;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
    client.on("ready", () => {
      ready = true;
    });
    client.on("error", (err) => {
      ready = false;
      logger.warn({ err: err.message }, "redis error");
    });
    client.on("end", () => {
      ready = false;
    });
  }
  return client;
}

/** Best-effort connect at boot. Returns true if connected; never throws. */
export async function connectRedis(): Promise<boolean> {
  if (isTest) return false;
  try {
    await getRedis().connect();
    ready = true;
    logger.info("Redis connected");
    return true;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Redis unavailable — limiter/quota will fail-open");
    return false;
  }
}

export function redisReady(): boolean {
  return ready && client?.status === "ready";
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
    ready = false;
  }
}
