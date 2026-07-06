import { apiFetch } from "@/lib/api/client";

export interface UsageSummary {
  calls: number;
  success_rate: number; // 0..1
  avg_latency_ms: number;
  active_keys: number;
  window_days: number;
}

export interface UsagePoint {
  date: string; // YYYY-MM-DD
  calls: number;
  success: number;
  failed: number;
  avg_latency_ms: number;
}

export interface EndpointStat {
  endpoint: string;
  calls: number;
  success_rate: number;
  avg_latency_ms: number;
}

export interface StatusSlice {
  label: string;
  value: number; // percent 0..100
  count: number;
  color: string;
}

export interface UsageLog {
  id: string;
  endpoint: string | null;
  method: string;
  status: number;
  latency_ms: number;
  key_prefix: string | null;
  mode: string | null;
  outcome: string | null;
  detail: { origin?: string; destination?: string; zone?: string } | null;
  at: string;
}

export async function getUsageSummary(days = 30): Promise<UsageSummary> {
  return (await apiFetch<{ data: UsageSummary }>(`/usage/summary?days=${days}`)).data;
}
export async function getUsageSeries(days = 30): Promise<UsagePoint[]> {
  return (await apiFetch<{ data: UsagePoint[] }>(`/usage/series?days=${days}`)).data;
}
export async function getUsageLogs(limit = 10, keyId?: string): Promise<UsageLog[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (keyId) q.set("key_id", keyId);
  return (await apiFetch<{ data: UsageLog[] }>(`/usage/logs?${q.toString()}`)).data;
}
export async function getUsageByEndpoint(days = 30): Promise<EndpointStat[]> {
  return (await apiFetch<{ data: EndpointStat[] }>(`/usage/endpoints?days=${days}`)).data;
}
export async function getUsageByStatus(days = 30): Promise<StatusSlice[]> {
  return (await apiFetch<{ data: StatusSlice[] }>(`/usage/status?days=${days}`)).data;
}
