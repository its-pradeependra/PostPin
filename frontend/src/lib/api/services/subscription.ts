import { apiFetch } from "@/lib/api/client";

export interface Subscription {
  plan: {
    code: string;
    name: string;
    included_calls: number;
    rate_limit_rpm: number | null;
    price_monthly_paise: number;
    overage_per_1k_paise: number | null;
    max_api_keys: number | null;
  };
  status: string;
  interval: string;
  current_period_start: string;
  current_period_end: string;
  usage: { calls_used: number; included_calls: number; remaining: number; overage_calls: number };
}

export async function getSubscription(): Promise<Subscription> {
  return (await apiFetch<{ data: Subscription }>("/subscription")).data;
}
