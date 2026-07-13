import type { HttpClient } from "../http.js";
import type { Pincode, RequestOptions, StateSummary } from "../types.js";

/** Pincode directory lookups. */
export class Pincodes {
  constructor(private readonly http: HttpClient) {}

  /**
   * Full details for a single pincode (office, district, state, flags, and a
   * few nearby pincodes in the same district).
   *
   * @example
   * const p = await postpin.pincodes.get("302001"); // Jaipur
   */
  async get(code: string, options: RequestOptions = {}): Promise<Pincode> {
    const { data } = await this.http.request<Pincode>({
      method: "GET",
      path: `/public/pincodes/${encodeURIComponent(code)}`,
      signal: options.signal,
    });
    return data;
  }

  /** List every state/UT with its serviceable-pincode and metro counts. */
  async states(options: RequestOptions = {}): Promise<StateSummary[]> {
    const { data } = await this.http.request<StateSummary[]>({
      method: "GET",
      path: "/public/pincodes/states",
      signal: options.signal,
    });
    return data;
  }
}
