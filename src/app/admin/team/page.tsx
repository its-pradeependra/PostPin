"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/components/providers/session-provider";

import { listAdminTeam, updateStaffRole, type StaffRow } from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";
import { formatDate, formatRelativeTime } from "@/lib/format";

/* ──────────────────────────────────────────────────────────────────
 * Role metadata (styling + static blurbs mirroring the seeded
 * platform role definitions — names themselves come from the API)
 * ──────────────────────────────────────────────────────────────── */

const ROLE_BADGE: Record<string, React.ComponentProps<typeof Badge>["variant"]> = {
  super_admin: "gradient",
  support_admin: "info",
  billing_admin: "default",
  read_only: "muted",
};

const ROLE_DESC: Record<string, string> = {
  super_admin: "Unscoped access to every control surface, including settings and roles.",
  support_admin: "Tenant support, tickets, pincode sync and force key revocation.",
  billing_admin: "Plans, invoices, refunds and coupons.",
  read_only: "View-only access across the portal — no mutations.",
};

interface RoleOption {
  key: string;
  name: string;
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────── */

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function RoleBadge({ role, roleName }: { role: string; roleName: string }) {
  return (
    <Badge variant={ROLE_BADGE[role] ?? "muted"} data-testid={`admin-team-role-badge-${role}`}>
      {roleName}
    </Badge>
  );
}

/** Per-row role control: a select for teammates, a static badge for your own row. */
function RoleControl({
  member,
  self,
  roles,
  onChange,
}: {
  member: StaffRow;
  self: boolean;
  roles: RoleOption[];
  onChange: (m: StaffRow, role: string) => void;
}) {
  if (self) {
    return (
      <div
        className="flex items-center justify-end gap-1.5"
        data-testid={`admin-team-own-role-${member.id}`}
      >
        <RoleBadge role={member.role} roleName={member.role_name} />
        <span className="text-xs text-muted-foreground" title="You can't change your own role">
          (you)
        </span>
      </div>
    );
  }
  return (
    <Select value={member.role} onValueChange={(v) => onChange(member, v)}>
      <SelectTrigger
        className="h-8 w-38"
        aria-label={`Change role for ${member.name}`}
        data-testid={`admin-team-role-select-${member.id}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem
            key={r.key}
            value={r.key}
            data-testid={`admin-team-role-option-${member.id}-${r.key}`}
          >
            {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────── */

export default function AdminTeamPage() {
  const qc = useQueryClient();
  const { user } = useSession();

  const q = useQuery({ queryKey: ["admin", "team"], queryFn: listAdminTeam });
  const staff = q.data?.staff ?? [];
  const roles = q.data?.roles ?? [];

  const [pending, setPending] = React.useState<{
    member: StaffRow;
    role: string;
    roleName: string;
  } | null>(null);

  const roleM = useMutation({
    mutationFn: (vars: { member: StaffRow; role: string; roleName: string }) =>
      updateStaffRole(vars.member.id, vars.role),
    onSuccess: (_res, vars) => {
      void qc.invalidateQueries({ queryKey: ["admin", "team"] });
      toast.success(`${vars.member.name} is now ${vars.roleName}`);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Couldn't change the role"),
  });

  const activeSuperAdmins = staff.filter(
    (m) => m.role === "super_admin" && m.status === "active",
  ).length;

  function isLastSuperAdmin(m: StaffRow) {
    return m.role === "super_admin" && activeSuperAdmins <= 1;
  }

  function isSelf(m: StaffRow) {
    return user != null && (m.id === user.id || m.email === user.email);
  }

  function requestRoleChange(m: StaffRow, roleKey: string) {
    if (roleKey === m.role) return;
    const roleName = roles.find((r) => r.key === roleKey)?.name ?? roleKey;
    setPending({ member: m, role: roleKey, roleName });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Sub-admins & roles"
        description="The Postpin staff who operate the portal — review access and reassign platform roles."
      />

      <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
        <Tabs defaultValue="members" className="space-y-6">
          <TabsList data-testid="admin-team-tabs">
            <TabsTrigger value="members" className="group" data-testid="admin-team-tab-members">
              <Icon name="users" trigger="group-hover" size={15} /> Members
            </TabsTrigger>
            <TabsTrigger value="roles" className="group" data-testid="admin-team-tab-roles">
              <Icon name="shieldCheck" trigger="group-hover" size={15} /> Roles &amp; permissions
            </TabsTrigger>
          </TabsList>

          {/* ── Members ─────────────────────────────────────────── */}
          <TabsContent value="members" className="space-y-4">
            <p className="text-sm text-muted-foreground" data-testid="admin-team-deferred-note">
              Staff invites &amp; 2FA are coming soon — accounts are provisioned by a super admin.
            </p>

            {staff.length === 0 ? (
              <EmptyState
                icon="users"
                title="No staff yet"
                description="Platform staff accounts are provisioned by a super admin and appear here."
                testId="admin-team-empty-state"
              />
            ) : (
              <>
                {/* Desktop / tablet table */}
                <Card className="hidden overflow-x-auto p-0 md:block" data-testid="admin-team-table">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Admin</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last login</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-right">Change role</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staff.map((m) => (
                        <TableRow key={m.id} className="group" data-testid={`admin-team-row-${m.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar className="size-8">
                                <AvatarFallback>{initials(m.name)}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {m.name}
                                  {isLastSuperAdmin(m) && (
                                    <span
                                      className="ml-1.5 align-middle text-primary"
                                      title="Last super admin"
                                    >
                                      <Icon name="verified" size={13} />
                                    </span>
                                  )}
                                </p>
                                <p className="truncate font-mono text-xs text-muted-foreground">
                                  {m.email}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <RoleBadge role={m.role} roleName={m.role_name} />
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={m.status} testId={`admin-team-status-${m.id}`} />
                          </TableCell>
                          <TableCell
                            className="text-sm text-muted-foreground"
                            data-testid={`admin-team-last-login-${m.id}`}
                          >
                            {m.last_login_at ? formatRelativeTime(m.last_login_at) : "Never"}
                          </TableCell>
                          <TableCell
                            className="text-sm text-muted-foreground"
                            data-testid={`admin-team-joined-${m.id}`}
                          >
                            {formatDate(m.created_at)}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              <RoleControl
                                member={m}
                                self={isSelf(m)}
                                roles={roles}
                                onChange={requestRoleChange}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>

                {/* Mobile cards */}
                <div className="grid gap-3 md:hidden">
                  {staff.map((m) => (
                    <Card key={m.id} className="group p-4" data-testid={`admin-team-card-${m.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar className="size-9">
                            <AvatarFallback>{initials(m.name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{m.name}</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">
                              {m.email}
                            </p>
                          </div>
                        </div>
                        <RoleControl
                          member={m}
                          self={isSelf(m)}
                          roles={roles}
                          onChange={requestRoleChange}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <RoleBadge role={m.role} roleName={m.role_name} />
                        <StatusBadge status={m.status} />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Last login{" "}
                        {m.last_login_at ? formatRelativeTime(m.last_login_at) : "never"} · joined{" "}
                        {formatDate(m.created_at)}
                      </p>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* ── Roles & permissions ─────────────────────────────── */}
          <TabsContent value="roles" className="space-y-4">
            {/* Role summary cards */}
            <div
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              data-testid="admin-team-role-list"
            >
              {roles.map((r) => {
                const count = staff.filter((m) => m.role === r.key).length;
                return (
                  <Card key={r.key} data-testid={`admin-team-role-card-${r.key}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{r.name}</CardTitle>
                        <RoleBadge role={r.key} roleName={r.name} />
                      </div>
                      {ROLE_DESC[r.key] && <CardDescription>{ROLE_DESC[r.key]}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                      <p
                        className="font-mono text-sm tabular-nums text-muted-foreground"
                        data-testid={`admin-team-role-count-${r.key}`}
                      >
                        {count} {count === 1 ? "member" : "members"}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <p className="text-sm text-muted-foreground" data-testid="admin-team-permissions-note">
              A detailed per-role permission matrix is coming soon — role permissions are defined in
              the platform seed and enforced by the API.
            </p>
          </TabsContent>
        </Tabs>
      </QueryBoundary>

      {/* Role-change confirmation */}
      {pending && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) setPending(null);
          }}
        >
          <DialogContent className="max-w-md" data-testid="admin-team-role-confirm-dialog">
            <DialogHeader>
              <DialogTitle>Change {pending.member.name}&apos;s role?</DialogTitle>
              <DialogDescription>
                {pending.member.name} moves from {pending.member.role_name} to {pending.roleName}.
                Their platform access changes immediately.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPending(null)}
                data-testid="admin-team-role-confirm-cancel-btn"
              >
                Cancel
              </Button>
              <Button
                disabled={roleM.isPending}
                onClick={() => {
                  roleM.mutate(pending);
                  setPending(null);
                }}
                data-testid="admin-team-role-confirm-btn"
              >
                Change role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
