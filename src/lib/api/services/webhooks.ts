import { apiFetch } from "@/lib/api/client";

export const WEBHOOK_EVENTS = [
  "rate.calculated",
  "key.created",
  "key.revoked",
  "subscription.updated",
  "invoice.paid",
  "sync.completed",
  "sync.failed",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookDto {
  id: string;
  url: string;
  events: string[];
  status: "active" | "paused" | "disabled";
  description: string | null;
  secret_masked: string;
  last_delivery_at: string | null;
  success_rate: number; // 0..1
  created_at: string;
}

export interface WebhookDeliveryDto {
  id: string;
  webhook_id: string;
  event: string;
  status: number; // HTTP status code (0 on network failure)
  ok: boolean;
  attempt: number;
  duration_ms: number;
  at: string;
}

export async function listWebhooks(): Promise<{ webhooks: WebhookDto[]; cap: number }> {
  return apiFetch<{ webhooks: WebhookDto[]; cap: number }>("/webhooks");
}

export function createWebhook(input: { url: string; events: string[]; description?: string }) {
  return apiFetch<{ secret: string; webhook: WebhookDto }>("/webhooks", { method: "POST", body: input });
}

export async function updateWebhook(
  id: string,
  patch: { url?: string; events?: string[]; description?: string; status?: "active" | "paused" | "disabled" },
): Promise<WebhookDto> {
  return (await apiFetch<{ webhook: WebhookDto }>(`/webhooks/${id}`, { method: "PATCH", body: patch })).webhook;
}

export function rollWebhookSecret(id: string) {
  return apiFetch<{ secret: string; webhook: WebhookDto }>(`/webhooks/${id}/roll-secret`, { method: "POST" });
}

export function testWebhook(id: string) {
  return apiFetch<{ delivery: WebhookDeliveryDto }>(`/webhooks/${id}/test`, { method: "POST" });
}

export function deleteWebhook(id: string) {
  return apiFetch<{ ok: boolean }>(`/webhooks/${id}`, { method: "DELETE" });
}

export async function listDeliveries(limit = 20, webhookId?: string): Promise<WebhookDeliveryDto[]> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (webhookId) qs.set("webhook_id", webhookId);
  return (await apiFetch<{ deliveries: WebhookDeliveryDto[] }>(`/webhooks/deliveries?${qs.toString()}`)).deliveries;
}

export function replayDelivery(deliveryId: string) {
  return apiFetch<{ delivery: WebhookDeliveryDto }>(`/webhooks/deliveries/${deliveryId}/replay`, { method: "POST" });
}
