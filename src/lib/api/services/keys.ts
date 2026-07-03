import { apiFetch } from "@/lib/api/client";

export interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  masked: string;
  mode: "live" | "test";
  status: "active" | "revoked" | "expired";
  allowed_domains: string[];
  last_used_at: string | null;
  request_count: number;
  created_at: string;
}

export async function listKeys(): Promise<ApiKeyDto[]> {
  const res = await apiFetch<{ keys: ApiKeyDto[] }>("/keys");
  return res.keys;
}

export async function getKey(id: string): Promise<ApiKeyDto> {
  return (await apiFetch<{ key: ApiKeyDto }>(`/keys/${id}`)).key;
}

export function updateKey(id: string, patch: { name?: string; allowed_domains?: string[] }) {
  return apiFetch<ApiKeyDto>(`/keys/${id}`, { method: "PATCH", body: patch });
}

export function createKey(input: { name: string; mode: "live" | "test"; allowed_domains?: string[] }) {
  return apiFetch<{ secret: string; key: ApiKeyDto }>("/keys", { method: "POST", body: input });
}

export function rotateKey(id: string) {
  return apiFetch<{ secret: string; key: ApiKeyDto }>(`/keys/${id}/rotate`, { method: "POST" });
}

export function revokeKey(id: string) {
  return apiFetch<{ ok: boolean }>(`/keys/${id}/revoke`, { method: "POST" });
}
