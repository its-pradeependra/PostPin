import { HttpClient, type ClientOptions } from "./http.js";
import { Rates } from "./resources/rates.js";
import { ServiceabilityResource } from "./resources/serviceability.js";
import { Pincodes } from "./resources/pincodes.js";
import { Plans } from "./resources/plans.js";
import * as webhooks from "./webhooks.js";
import { VERSION } from "./version.js";

/**
 * The Postpin API client.
 *
 * @example
 * import { Postpin } from "@postpin/node";
 * const postpin = new Postpin(process.env.POSTPIN_API_KEY!);
 * const rate = await postpin.rates.calculate({ origin: "400001", destination: "110001", weight: 1200 });
 */
export class Postpin {
  /** SDK version. */
  static readonly VERSION = VERSION;

  /**
   * Webhook helpers (static — no API key needed).
   * @example
   * const event = Postpin.webhooks.constructEvent(rawBody, req.headers["x-postpin-signature"], secret);
   */
  static readonly webhooks = webhooks;

  /** Shipping-rate calculation. */
  readonly rates: Rates;
  /** Pincode serviceability checks. */
  readonly serviceability: ServiceabilityResource;
  /** Pincode directory lookups. */
  readonly pincodes: Pincodes;
  /** Public subscription plans. */
  readonly plans: Plans;

  constructor(apiKey: string, options: ClientOptions = {}) {
    const http = new HttpClient(apiKey, options);
    this.rates = new Rates(http);
    this.serviceability = new ServiceabilityResource(http);
    this.pincodes = new Pincodes(http);
    this.plans = new Plans(http);
  }
}
