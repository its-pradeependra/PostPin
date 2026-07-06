import { apiFetch } from "@/lib/api/client";
import type { RateResult, ServiceLevel } from "@/lib/types";

export interface RateCalcInput {
  origin: string;
  destination: string;
  weightGrams: number;
  service: ServiceLevel;
  cod?: boolean;
  length?: number;
  width?: number;
  height?: number;
  declaredValue?: number; // rupees
}

interface RateEnvelope {
  data: RateResult;
  meta: { engine_ms?: number; cached?: boolean; request_id: string };
}

/** Anonymous demo quote (marketing + playground). IP rate-limited on the API. */
export async function calculatePublicRate(input: RateCalcInput): Promise<{ result: RateResult; engineMs?: number; cached?: boolean }> {
  const res = await apiFetch<RateEnvelope>("/public/rates/calculate", {
    method: "POST",
    body: {
      origin: input.origin,
      destination: input.destination,
      weight: input.weightGrams,
      service: input.service,
      cod: input.cod,
      length: input.length,
      width: input.width,
      height: input.height,
      declared_value: input.declaredValue,
    },
  });
  return { result: res.data, engineMs: res.meta.engine_ms, cached: res.meta.cached };
}

export interface PincodeArea {
  pincode: string;
  found: boolean;
  serviceable: boolean;
  city: string | null;
  state: string | null;
}

/** Resolve the area (city/state) for a 6-digit pincode from the live India Post
 * master — powers the inline captions under the calculator's From/To inputs. */
export async function lookupPincodeArea(pincode: string, signal?: AbortSignal): Promise<PincodeArea> {
  const res = await apiFetch<{ data: PincodeArea }>(`/public/serviceability/${pincode}`, { signal });
  return res.data;
}
