import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: "forks",
    // Deterministic secrets for billing signature/webhook tests (no real Razorpay calls).
    env: {
      RAZORPAY_KEY_SECRET: "test_key_secret",
      RAZORPAY_WEBHOOK_SECRET: "test_webhook_secret",
      // mongodb-memory-server data dirs land in os.tmpdir(); keep them off the
      // nearly-full C: drive (mongod fasserts when the disk fills mid-run).
      TEMP: "D:\\tmp\\vitest-mongo",
      TMP: "D:\\tmp\\vitest-mongo",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
