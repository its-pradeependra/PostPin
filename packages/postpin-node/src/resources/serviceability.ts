import type { HttpClient } from "../http.js";
import type { RequestOptions, Serviceability } from "../types.js";

/** Quick "can I ship to this pincode?" lookup. */
export class ServiceabilityResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Check whether a pincode is serviceable and resolve its city/state.
   *
   * @example
   * const s = await postpin.serviceability.check("781001");
   * if (s.serviceable) console.log(`${s.city}, ${s.state}`);
   */
  async check(pincode: string, options: RequestOptions = {}): Promise<Serviceability> {
    const { data } = await this.http.request<Serviceability>({
      method: "GET",
      path: `/public/serviceability/${encodeURIComponent(pincode)}`,
      signal: options.signal,
    });
    return data;
  }
}
