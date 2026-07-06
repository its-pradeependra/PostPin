"use client";

import { siteHost } from "@/lib/site";
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

import {
  getRoleMatrix,
  inviteStaff,
  listAdminTeam,
  removeStaff,
  updateStaffRole,
  type StaffRow,
} from "@/lib/api/services/admin";
import { TwoFactorCard } from "@/components/shared/two-factor-card";
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
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<StaffRow | null>(null);

  const removeM = useMutation({
    mutationFn: (m: StaffRow) => removeStaff(m.id),
    onSuccess: (_r, m) => {
      void qc.invalidateQueries({ queryKey: ["admin", "team"] });
      toast.success(`${m.name} was removed from the platform team.`);
      setRemoving(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't remove the member"),
  });

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
        description="The Postpin staff who operate the portal — invite members, manage 2FA, and reassign platform roles."
      >
        <Button
          variant="gradient"
          className="group"
          onClick={() => setInviteOpen(true)}
          data-testid="admin-team-invite-btn"
        >
          <Icon name="plus" trigger="group-hover" size={16} className="text-white" />
          Invite staff
        </Button>
      </PageHeader>

      <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
        <Tabs defaultValue="members" className="space-y-6">
          <TabsList data-testid="admin-team-tabs">
            <TabsTrigger value="members" className="group" data-testid="admin-team-tab-members">
              <Icon name="users" trigger="group-hover" size={15} /> Members
            </TabsTrigger>
            <TabsTrigger value="roles" className="group" data-testid="admin-team-tab-roles">
              <Icon name="shieldCheck" trigger="group-hover" size={15} /> Roles &amp; permissions
            </TabsTrigger>
            <TabsTrigger value="security" className="group" data-testid="admin-team-tab-security">
              <Icon name="lock" trigger="group-hover" size={15} /> Your 2FA
            </TabsTrigger>
          </TabsList>

          {/* ── Members ─────────────────────────────────────────── */}
          <TabsContent value="members" className="space-y-4">
            <p className="text-sm text-muted-foreground" data-testid="admin-team-invite-hint">
              Invite platform staff by email — they set a password from the invite link, then can
              enable two-factor auth on their own account.
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
                            <div className="flex items-center justify-end gap-1.5">
                              <RoleControl
                                member={m}
                                self={isSelf(m)}
                                roles={roles}
                                onChange={requestRoleChange}
                              />
                              {!isSelf(m) && !isLastSuperAdmin(m) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="group size-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => setRemoving(m)}
                                  aria-label={`Remove ${m.name}`}
                                  data-testid={`admin-team-remove-btn-${m.id}`}
                                >
                                  <Icon name="trash" trigger="group-hover" size={14} />
                                </Button>
                              )}
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

            <RoleMatrixCard />
          </TabsContent>

          {/* ── Your 2FA ─────────────────────────────────────────── */}
          <TabsContent value="security" className="space-y-4">
            <TwoFactorCard
              testIdPrefix="admin-2fa"
              description="Protect your admin account with a TOTP authenticator app."
            />
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

      {/* Remove-staff confirmation */}
      {removing && (
        <Dialog open onOpenChange={(o) => !o && setRemoving(null)}>
          <DialogContent className="max-w-md" data-testid="admin-team-remove-dialog">
            <DialogHeader>
              <DialogTitle>Remove {removing.name}?</DialogTitle>
              <DialogDescription>
                {removing.name} loses all platform access immediately and their sessions are
                revoked. This can&apos;t be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRemoving(null)} data-testid="admin-team-remove-cancel-btn">
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={removeM.isPending}
                onClick={() => removeM.mutate(removing)}
                data-testid="admin-team-remove-confirm-btn"
              >
                {removeM.isPending ? "Removing…" : "Remove member"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {inviteOpen && <InviteStaffDialog roles={roles} onClose={() => setInviteOpen(false)} onInvited={() => { void qc.invalidateQueries({ queryKey: ["admin", "team"] }); setInviteOpen(false); }} />}
    </div>
  );
}

/* ── Invite staff dialog ──────────────────────────────────────────── */
function InviteStaffDialog({ roles, onClose, onInvited }: { roles: RoleOption[]; onClose: () => void; onInvited: () => void }) {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [roleKey, setRoleKey] = React.useState(roles.find((r) => r.key !== "super_admin")?.key ?? roles[0]?.key ?? "read_only");

  const inviteM = useMutation({
    mutationFn: () => inviteStaff({ email: email.trim(), name: name.trim(), role_key: roleKey }),
    onSuccess: (r) => {
      toast.success(`Invite sent to ${r.email}.`, { description: "They'll set a password from the emailed link." });
      onInvited();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't send the invite"),
  });

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="admin-team-invite-dialog">
        <DialogHeader>
          <DialogTitle>Invite a staff member</DialogTitle>
          <DialogDescription>
            They receive an email to set their password, then get platform access at the role you
            pick.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`teammate@${siteHost}`}
              data-testid="admin-team-invite-email-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Name</Label>
            <Input
              id="invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jordan Rao"
              data-testid="admin-team-invite-name-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={roleKey} onValueChange={setRoleKey}>
              <SelectTrigger data-testid="admin-team-invite-role-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="admin-team-invite-cancel-btn">
            Cancel
          </Button>
          <Button
            variant="gradient"
            disabled={inviteM.isPending || !emailValid || name.trim().length < 2}
            onClick={() => inviteM.mutate()}
            data-testid="admin-team-invite-send-btn"
          >
            <Icon name="send" trigger="group-hover" size={16} className="text-white" />
            {inviteM.isPending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Role → permission matrix ─────────────────────────────────────── */
function RoleMatrixCard() {
  const q = useQuery({ queryKey: ["admin", "role-matrix"], queryFn: getRoleMatrix });

  return (
    <Card className="overflow-hidden p-0" data-testid="admin-role-matrix-card">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-base">Permission matrix</CardTitle>
        <CardDescription>
          The live permissions each platform role grants — sourced from the role &amp; permission
          catalog the API enforces.
        </CardDescription>
      </CardHeader>
      <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
        {q.data && (
          <div className="overflow-x-auto">
            <Table data-testid="admin-role-matrix-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Permission</TableHead>
                  {q.data.roles.map((r) => (
                    <TableHead key={r.key} className="text-center">
                      {r.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.permissions.map((p) => (
                  <TableRow key={p.key} data-testid={`admin-role-matrix-row-${p.key}`}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs">{p.key}</span>
                        {p.is_dangerous && (
                          <Badge variant="destructive" className="px-1 py-0 text-[10px]">
                            danger
                          </Badge>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-xs text-muted-foreground">{p.description}</p>
                      )}
                    </TableCell>
                    {q.data!.roles.map((r) => (
                      <TableCell key={r.key} className="text-center" data-testid={`admin-role-matrix-${r.key}-${p.key}`}>
                        {r.permissions.includes(p.key) ? (
                          <Icon name="check" size={15} className="mx-auto text-success" />
                        ) : (
                          <span className="text-muted-foreground/40">–</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryBoundary>
    </Card>
  );
}

/* ── Your two-factor auth ─────────────────────────────────────────── */
