import { describe, it, expect } from "vitest";
import {
  Postpin,
  AuthenticationError,
  QuotaExceededError,
  RateLimitError,
  NotFoundError,
  ValidationError,
  ApiError,
  TimeoutError,
  ConnectionError,
  PostpinError,
} from "../src/index.js";
import type { FetchLike } from "../src/index.js";

const KEY = "pp_test_abc123";

/** Build a queued fake fetch: each call consumes the next handler (last repeats). */
function makeFetch(handlers: Array<() => Response | Promise<Response>>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const fn: FetchLike = async (url, init = {}) => {
    calls.push({ url, init });
    const h = handlers[Math.min(i, handlers.length - 1)]!;
    i += 1;
    return h();
  };
  return { fn, calls };
}

const ok = (data: unknown, meta: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ data, meta: { request_id: "req_1", ...meta } }), {
    status: 200,
    headers: { "content-type": "application/json", "x-request-id": "req_1" },
  });

const err = (status: number, code: string, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { code, message, request_id: "req_err" } }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const RATE = {
  zone: "metro",
  zoneLabel: "Metro",
  service: "express",
  serviceLabel: "Express",
  chargeableWeightGrams: 1200,
  volumetricWeightGrams: 0,
  etaDays: [1, 3],
  currency: "INR",
  breakdown: [{ label: "Base charge", amount: 88 }],
  total: 254.38,
  totalPaise: 25438,
  origin: { pincode: "400001", city: "Mumbai", state: "Maharashtra" },
  destination: { pincode: "110001", city: "New Delhi", state: "Delhi" },
  serviceable: true,
};

describe("client construction", () => {
  it("requires an API key", () => {
    // @ts-expect-error intentional
    expect(() => new Postpin()).toThrow(PostpinError);
    expect(() => new Postpin("")).toThrow(/API key/i);
  });

  it("exposes the version", () => {
    expect(typeof Postpin.VERSION).toBe("string");
  });
});

describe("rates.calculate", () => {
  it("POSTs the right body + headers and returns the typed result", async () => {
    const { fn, calls } = makeFetch([() => ok(RATE)]);
    const postpin = new Postpin(KEY, { fetch: fn });

    const rate = await postpin.rates.calculate({
      origin: "400001",
      destination: "110001",
      weight: 1200,
      service: "express",
      cod: true,
      declaredValue: 1499,
    });

    expect(rate.total).toBe(254.38);
    expect(rate.zoneLabel).toBe("Metro");

    const call = calls[0]!;
    expect(call.url).toBe("https://api.postpin.in/v1/rates/calculate");
    expect(call.init.method).toBe("POST");
    const headers = call.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    expect(headers["user-agent"]).toMatch(/^postpin-node\//);
    expect(headers["idempotency-key"]).toBeTruthy(); // auto-generated
    const body = JSON.parse(call.init.body as string);
    expect(body).toMatchObject({ origin: "400001", destination: "110001", weight: 1200, service: "express", cod: true, declared_value: 1499 });
  });

  it("honors an explicit idempotency key", async () => {
    const { fn, calls } = makeFetch([() => ok(RATE)]);
    const postpin = new Postpin(KEY, { fetch: fn });
    await postpin.rates.calculate({ origin: "400001", destination: "110001", weight: 500 }, { idempotencyKey: "my-key" });
    expect((calls[0]!.init.headers as Record<string, string>)["idempotency-key"]).toBe("my-key");
  });
});

describe("public resources", () => {
  it("serviceability.check", async () => {
    const { fn, calls } = makeFetch([() => ok({ pincode: "781001", serviceable: true, found: true, city: "Guwahati", state: "Assam" })]);
    const postpin = new Postpin(KEY, { fetch: fn });
    const s = await postpin.serviceability.check("781001");
    expect(s.city).toBe("Guwahati");
    expect(calls[0]!.url).toBe("https://api.postpin.in/v1/public/serviceability/781001");
    expect(calls[0]!.init.method).toBe("GET");
  });

  it("pincodes.get + states", async () => {
    const { fn } = makeFetch([
      () => ok({ pincode: "302001", city: "Jaipur", state: "Rajasthan", is_metro: false, is_remote: false, serviceable: true, nearby: [] }),
      () => ok([{ state: "Rajasthan", slug: "rajasthan", count: 100, metros: 0 }]),
    ]);
    const postpin = new Postpin(KEY, { fetch: fn });
    expect((await postpin.pincodes.get("302001")).city).toBe("Jaipur");
    expect((await postpin.pincodes.states())[0]!.slug).toBe("rajasthan");
  });

  it("plans.list", async () => {
    const { fn } = makeFetch([() => ok([{ code: "free", name: "Free", included_calls: 1000 }])]);
    const postpin = new Postpin(KEY, { fetch: fn });
    const plans = await postpin.plans.list();
    expect(plans[0]!.code).toBe("free");
  });
});

describe("error mapping", () => {
  const cases: Array<[number, string, unknown]> = [
    [400, "validation_error", ValidationError],
    [401, "invalid_key", AuthenticationError],
    [402, "quota_exceeded", QuotaExceededError],
    [404, "not_found", NotFoundError],
    [500, "internal", ApiError],
  ];
  for (const [status, code, Type] of cases) {
    it(`maps HTTP ${status} → ${(Type as { name: string }).name}`, async () => {
      const { fn } = makeFetch([() => err(status, code, "boom")]);
      const postpin = new Postpin(KEY, { fetch: fn, maxRetries: 0 });
      await expect(postpin.pincodes.get("000000")).rejects.toBeInstanceOf(Type as never);
      await expect(postpin.pincodes.get("000000")).rejects.toMatchObject({ code, statusCode: status, requestId: "req_err" });
    });
  }

  it("429 → RateLimitError with retryAfter", async () => {
    const { fn } = makeFetch([() => err(429, "rate_limited", "slow down", { "retry-after": "42" })]);
    const postpin = new Postpin(KEY, { fetch: fn, maxRetries: 0 });
    const caught = await postpin.rates.calculate({ origin: "400001", destination: "110001", weight: 500 }).catch((e) => e);
    expect(caught).toBeInstanceOf(RateLimitError);
    expect(caught.retryAfter).toBe(42);
  });
});

describe("retries", () => {
  it("retries a 500 then succeeds", async () => {
    const { fn, calls } = makeFetch([() => err(500, "internal", "boom"), () => ok(RATE)]);
    const postpin = new Postpin(KEY, { fetch: fn, maxRetries: 2 });
    const rate = await postpin.rates.calculate({ origin: "400001", destination: "110001", weight: 500 });
    expect(rate.total).toBe(254.38);
    expect(calls.length).toBe(2);
  });

  it("retries a network error then succeeds", async () => {
    let n = 0;
    const fn: FetchLike = async () => {
      n += 1;
      if (n === 1) throw new TypeError("fetch failed");
      return ok(RATE);
    };
    const postpin = new Postpin(KEY, { fetch: fn, maxRetries: 1 });
    const rate = await postpin.rates.calculate({ origin: "400001", destination: "110001", weight: 500 });
    expect(rate.total).toBe(254.38);
    expect(n).toBe(2);
  });

  it("gives up after maxRetries and throws the last error", async () => {
    const { fn, calls } = makeFetch([() => err(503, "unavailable", "down")]);
    const postpin = new Postpin(KEY, { fetch: fn, maxRetries: 2 });
    await expect(postpin.pincodes.get("302001")).rejects.toBeInstanceOf(ApiError);
    expect(calls.length).toBe(3); // 1 + 2 retries
  });

  it("does NOT retry a 400", async () => {
    const { fn, calls } = makeFetch([() => err(400, "validation_error", "bad")]);
    const postpin = new Postpin(KEY, { fetch: fn, maxRetries: 3 });
    await expect(postpin.pincodes.get("bad")).rejects.toBeInstanceOf(ValidationError);
    expect(calls.length).toBe(1);
  });

  it("surfaces a ConnectionError when the network keeps failing", async () => {
    const fn: FetchLike = async () => {
      throw new TypeError("ECONNREFUSED");
    };
    const postpin = new Postpin(KEY, { fetch: fn, maxRetries: 1 });
    await expect(postpin.plans.list()).rejects.toBeInstanceOf(ConnectionError);
  });
});

describe("timeout", () => {
  it("aborts and throws TimeoutError", async () => {
    const fn: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    const postpin = new Postpin(KEY, { fetch: fn, timeout: 20, maxRetries: 0 });
    await expect(postpin.plans.list()).rejects.toBeInstanceOf(TimeoutError);
  });
});
