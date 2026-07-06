import { apiFetch } from "@/lib/api/client";

export type TenantRole = "owner" | "developer" | "member";

export interface TeamMemberDto {
  id: string;
  name: string;
  email: string;
  role: TenantRole;
  status: "active" | "invited";
  last_active_at: string;
  is_current_user: boolean;
}

export interface MembersResponse {
  members: TeamMemberDto[];
  seat_cap: number;
  seat_used: number;
}

export function listMembers() {
  return apiFetch<MembersResponse>("/members");
}

export function inviteMember(email: string, role: TenantRole) {
  return apiFetch<{ member: TeamMemberDto }>("/members/invite", { method: "POST", body: { email, role } });
}

export function changeMemberRole(id: string, role: TenantRole) {
  return apiFetch<{ member: TeamMemberDto }>(`/members/${id}/role`, { method: "PATCH", body: { role } });
}

export function removeMember(id: string) {
  return apiFetch<{ ok: boolean }>(`/members/${id}`, { method: "DELETE" });
}

export function acceptInvite(token: string, name: string, password: string) {
  return apiFetch<{ ok: boolean; email: string }>("/auth/accept-invite", { method: "POST", body: { token, name, password } });
}
