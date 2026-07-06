/**
 * Postpin — PM2 ecosystem (production, pnpm)
 *
 * Apps:  Postpin-F  → Next.js frontend  (postpin.creatibyte.in)
 *        Postpin-S  → Fastify API       (api.postpin.creatibyte.in)
 *
 * ── Set your ports HERE — nothing else needs editing ────────────────────────
 * nginx must proxy to the same numbers (WebServer File/*.conf).
 */
const FRONTEND_PORT = 3000;
const BACKEND_PORT = 4000;

/**
 * First deploy on the VPS (from the repo root, pnpm installed):
 *   cd frontend && pnpm install && pnpm build && cd ..
 *   cd server   && pnpm install && cp .env.example .env   # fill it in
 *   cd server   && pnpm run gen-keys                      # appends JWT keys to .env
 *   cd server   && pnpm run seed                          # once, on an empty DB
 *   pm2 start ecosystem.config.js
 *   pm2 save && pm2 startup                               # survive reboots
 *
 * (First `pnpm install` creates pnpm-lock.yaml — commit it; afterwards use
 *  `pnpm install --frozen-lockfile` for reproducible deploys.)
 *
 * Redeploy:
 *   git pull
 *   cd frontend && pnpm install --frozen-lockfile && pnpm build && cd ..
 *   cd server   && pnpm install --frozen-lockfile && cd ..
 *   pm2 restart Postpin-F Postpin-S
 *
 * Notes:
 *  - fork mode, instances:1 — matches the shared-VPS convention (cluster mode
 *    misbehaves with many co-resident PM2 apps).
 *  - PM2 executes the apps' real JS entrypoints below (not `pnpm start`), so
 *    PM2 monitors node itself — no package-manager wrapper process in between.
 *    pnpm symlinks `node_modules/next` and `node_modules/tsx`, so these paths
 *    resolve under pnpm exactly as they do under npm.
 *  - The API runs via tsx (a prod dependency; same as dev, no watch): tsc does
 *    not rewrite the `@/` path aliases, so `node dist/` would not boot.
 *  - PM2's env PORT wins over server/.env (dotenv never overrides existing
 *    process.env), so the constants above are the single source of truth.
 *  - The frontend needs NEXT_PUBLIC_API_URL in frontend/.env.local (or the
 *    shell) AT BUILD TIME — it is baked in by `pnpm build`, not read here.
 */
module.exports = {
  apps: [
    {
      name: "Postpin-F",
      cwd: "./frontend",
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${FRONTEND_PORT}`,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "600M",
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: String(FRONTEND_PORT),
      },
    },
    {
      name: "Postpin-S",
      cwd: "./server",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "src/index.ts",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "600M",
      time: true,
      env: {
        NODE_ENV: "production",
        PORT: String(BACKEND_PORT),
      },
    },
  ],
};
