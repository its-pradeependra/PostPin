import type { HttpClient } from "../http.js";
import type { Plan, RequestOptions } from "../types.js";

/** Public subscription plans (the ones shown on the pricing page). */
export class Plans {
  constructor(private readonly http: HttpClient) {}

  /** List all public, active plans in display order. */
  async list(options: RequestOptions = {}): Promise<Plan[]> {
    const { data } = await this.http.request<Plan[]>({
      method: "GET",
      path: "/public/plans",
      signal: options.signal,
    });
    return data;
  }
}
