import { beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "@/app.js";
import { initJwt } from "@/lib/jwt.js";

describe("app (M0 boot gate)", () => {
  beforeAll(async () => {
    await initJwt();
  });

  it("GET /health returns ok", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
    await app.close();
  });

  it("GET /.well-known/jwks.json returns one EdDSA key", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/.well-known/jwks.json" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { keys: Array<Record<string, string>> };
    expect(body.keys).toHaveLength(1);
    expect(body.keys[0]?.kty).toBe("OKP");
    expect(body.keys[0]?.alg).toBe("EdDSA");
    expect(body.keys[0]?.kid).toBeTruthy();
    await app.close();
  });

  it("unknown route returns the standard error envelope", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string; request_id: string } };
    expect(body.error.code).toBe("not_found");
    expect(body.error.request_id).toBeTruthy();
    await app.close();
  });
});
