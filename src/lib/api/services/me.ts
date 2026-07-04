import { apiFetch } from "@/lib/api/client";

export interface MeUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  is_platform_staff: boolean;
  avatar_url: string | null;
  locale: string;
  timezone: string;
}

export interface MeCompany {
  id: string;
  name: string;
  slug: string;
  status: string;
  onboardingStep: string;
}

export interface MeSubscription {
  plan_code: string;
  status: string;
  interval: string;
  current_period_end: string;
  usage: { callsUsed: number; includedCalls: number; overageCalls: number; periodKey: string };
}

export interface Me {
  user: MeUser;
  company: MeCompany | null;
  subscription: MeSubscription | null;
}

export function getMe() {
  return apiFetch<Me>("/auth/me");
}
