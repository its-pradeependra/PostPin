/**
 * Pincode directory data access (server components only).
 * Backed by the public API; every call ISR-caches for 6 h — the master itself
 * changes only via the nightly India Post sync.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";
const REVALIDATE = 21_600; // 6 h

export interface StateSummary {
  state: string;
  slug: string;
  count: number;
  metros: number;
}

export interface DistrictSummary {
  district: string;
  slug: string;
  count: number;
}

export interface StateDetail extends StateSummary {
  districts: DistrictSummary[];
}

export interface DistrictDetail {
  state: string;
  state_slug: string;
  district: string;
  district_slug: string;
  count: number;
  pincodes: { pincode: string; area: string | null; is_metro: boolean; is_remote: boolean }[];
}

export interface PincodeDetail {
  pincode: string;
  office_name: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  state_code: string | null;
  state_slug: string | null;
  district_slug: string | null;
  is_metro: boolean;
  is_remote: boolean;
  serviceable: { prepaid: boolean; cod: boolean; pickup: boolean };
  nearby: { pincode: string; city: string | null; is_metro: boolean }[];
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    const j = (await res.json()) as { data: T };
    return j.data ?? null;
  } catch {
    return null;
  }
}

export const fetchStates = () => get<StateSummary[]>("/public/pincodes/states");
export const fetchStateDetail = (slug: string) => get<StateDetail>(`/public/pincodes/states/${slug}`);
export const fetchDistrictDetail = (stateSlug: string, districtSlug: string) =>
  get<DistrictDetail>(`/public/pincodes/states/${stateSlug}/${districtSlug}`);
export const fetchPincodeDetail = (code: string) =>
  /^\d{6}$/.test(code) ? get<PincodeDetail>(`/public/pincodes/${code}`) : Promise.resolve(null);
