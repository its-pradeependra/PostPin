import type { HttpClient } from "../http.js";
import type { RateCalculateParams, RateResult, RequestOptions } from "../types.js";

/** Shipping-rate calculation — the core, billable endpoint. */
export class Rates {
  constructor(private readonly http: HttpClient) {}

  /**
   * Calculate a shipping rate between two pincodes.
   *
   * @example
   * const rate = await postpin.rates.calculate({
   *   origin: "400001",
   *   destination: "110001",
   *   weight: 1200,
   *   service: "express",
   * });
   * console.log(rate.total, rate.zoneLabel);
   */
  async calculate(params: RateCalculateParams, options: RequestOptions = {}): Promise<RateResult> {
    const { data } = await this.http.request<RateResult>({
      method: "POST",
      path: "/rates/calculate",
      body: {
        origin: params.origin,
        destination: params.destination,
        weight: params.weight,
        length: params.length,
        width: params.width,
        height: params.height,
        service: params.service,
        cod: params.cod,
        declared_value: params.declaredValue,
      },
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    });
    return data;
  }
}
