import { type JWTPayload, SignJWT, exportJWK, importPKCS8, importSPKI, jwtVerify } from "jose";
import type { KeyLike } from "jose";
import { env, jwtPrivateKeyPem, jwtPublicKeyPem } from "@/config/env.js";

const ALG = "EdDSA";

let privateKey: KeyLike | null = null;
let publicKey: KeyLike | null = null;

/** Load the EdDSA keypair. Must be called once at boot before signing/verifying. */
export async function initJwt(): Promise<void> {
  privateKey = await importPKCS8(jwtPrivateKeyPem, ALG);
  publicKey = await importSPKI(jwtPublicKeyPem, ALG);
}

export type AccessClaims = {
  sub: string; // userId
  companyId: string | null;
  role: string; // role key
  permVersion: number;
  isPlatformStaff: boolean;
  sid: string; // session id
  amr: string[]; // auth methods (pwd, otp)
};

export async function signAccessToken(claims: AccessClaims): Promise<string> {
  if (!privateKey) throw new Error("JWT not initialized — call initJwt() first");
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: ALG, kid: env.JWT_KID })
    .setIssuedAt()
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL}s`)
    .sign(privateKey);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims & JWTPayload> {
  if (!publicKey) throw new Error("JWT not initialized — call initJwt() first");
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
  return payload as AccessClaims & JWTPayload;
}

/** JWKS document for `/.well-known/jwks.json`. */
export async function getJwks(): Promise<{ keys: Record<string, unknown>[] }> {
  if (!publicKey) throw new Error("JWT not initialized — call initJwt() first");
  const jwk = await exportJWK(publicKey);
  return { keys: [{ ...jwk, kid: env.JWT_KID, alg: ALG, use: "sig" }] };
}
