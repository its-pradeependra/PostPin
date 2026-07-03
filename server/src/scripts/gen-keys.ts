import { generateKeyPairSync } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Generates an EdDSA (Ed25519) keypair and appends it to server/.env (single-line, \n-escaped). */
const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "../../.env");

const current = readFileSync(envPath, "utf8");
if (/^JWT_PRIVATE_KEY=/m.test(current)) {
  console.log("JWT keys already present in .env — nothing to do.");
  process.exit(0);
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString().trim().replace(/\r?\n/g, "\\n");
const pub = publicKey.export({ type: "spki", format: "pem" }).toString().trim().replace(/\r?\n/g, "\\n");

appendFileSync(envPath, `JWT_PRIVATE_KEY=${priv}\nJWT_PUBLIC_KEY=${pub}\n`);
console.log("Appended EdDSA (Ed25519) keypair to server/.env");
