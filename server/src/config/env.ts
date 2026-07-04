import "dotenv/config";
import { z } from "zod";

const boolish = z.preprocess((v) => v === true || v === "true" || v === "1", z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),

  // MongoDB — must target a DEDICATED database (never another app's db).
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().min(1).default("postpin"),

  REDIS_URL: z.string().default("redis://localhost:6379"),
  API_KEY_PEPPER: z.string().min(16).default("pp_pepper_dev_change_me_please_0001"),

  // Auth / JWT (EdDSA)
  JWT_KID: z.string().min(1),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  JWT_PRIVATE_KEY: z.string().min(1, "JWT_PRIVATE_KEY missing — run `npm run gen-keys`"),
  JWT_PUBLIC_KEY: z.string().min(1, "JWT_PUBLIC_KEY missing — run `npm run gen-keys`"),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2_592_000),

  COOKIE_DOMAIN: z.string().default(""),
  COOKIE_SECURE: boolish.default(false),

  ARGON_MEMORY_KIB: z.coerce.number().int().positive().default(19_456),
  ARGON_TIME_COST: z.coerce.number().int().positive().default(2),
  ARGON_PARALLELISM: z.coerce.number().int().positive().default(1),

  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default("Postpin <no-reply@postpin.local>"),

  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(""),

  // data.gov.in — All India Pincode Directory (Dept. of Posts). Registered key
  // enables the nightly live sync; empty = scheduler stays off.
  DATA_GOV_IN_API_KEY: z.string().default(""),
  DATA_GOV_IN_PINCODE_RESOURCE: z.string().default("5c2f62fe-5afa-4119-a499-fec9d604d5bd"),

  SEED_ADMIN_EMAIL: z.string().email().default("admin@postpin.dev"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("ChangeMe_Admin#2026"),

  // Local-disk media uploads (avatars, ticket attachments). Files are written
  // under UPLOAD_DIR and served at `${API_PUBLIC_URL}/uploads/...`.
  UPLOAD_DIR: z.string().default("uploads"),
  API_PUBLIC_URL: z.string().default(""),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    // Fail fast — never boot with invalid config.
    console.error(`❌ Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = load();
export type Env = typeof env;

export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
export const isDev = env.NODE_ENV === "development";

// Keys are stored in .env as single lines with literal "\n" — restore real newlines.
export const jwtPrivateKeyPem = env.JWT_PRIVATE_KEY.replace(/\\n/g, "\n");
export const jwtPublicKeyPem = env.JWT_PUBLIC_KEY.replace(/\\n/g, "\n");
