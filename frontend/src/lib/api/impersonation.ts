import { setAccessToken } from "@/lib/api/client";

/** Client-side impersonation state. The admin's real session lives in the
 * (untouched) refresh cookie; impersonation swaps only the in-memory access
 * token, so exiting just refreshes back to the admin. */

const KEY = "pp_impersonation";

export interface ImpersonationInfo {
  tenantName: string;
  tenantId: string;
}

export function enterImpersonation(accessToken: string, info: ImpersonationInfo): void {
  setAccessToken(accessToken);
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(KEY, JSON.stringify(info));
  }
}

export function getImpersonation(): ImpersonationInfo | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImpersonationInfo;
  } catch {
    return null;
  }
}

export function clearImpersonation(): void {
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(KEY);
}
