"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { SettingsNav } from "../settings-nav";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

import { changeMemberRole, inviteMember, listMembers, removeMember, type TeamMemberDto, type TenantRole } from "@/lib/api/services/members";
import { ApiError } from "@/lib/api/errors";
import { formatRelativeTime } from "@/lib/format";

const ROLE_OPTIONS: { value: TenantRole; label: string; hint: string }[] = [
  { value: "owner", label: "Owner", hint: "Full access incl. billing, team & ownership" },
  { value: "developer", label: "Developer", hint: "Manage API keys, webhooks & rate cards" },
  { value: "member", label: "Member", hint: "View-only access + open support tickets" },
];

const ROLE_LABEL: Record<TenantRole, string> = { owner: "Owner", developer: "Developer", member: "Member" };
const ROLE_VARIANT: Record<TenantRole, "gradient" | "info" | "muted"> = { owner: "gradient", developer: "info", member: "muted" };

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function TeamSettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["members"], queryFn: listMembers });
  const members = q.data?.members ?? [];
  const seatCap = q.data?.seat_cap ?? 0;
  const seatUsed = q.data?.seat_used ?? members.length;
  const seatsFull = seatCap !== -1 && seatUsed >= seatCap;

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["members"] });

  const inviteM = useMutation({
    mutationFn: ({ email, role }: { email: string; role: TenantRole }) => inviteMember(email, role),
    onSuccess: (res) => {
      invalidate();
      toast.success("Invitation sent", { description: `${res.member.email} was invited as ${ROLE_LABEL[res.member.role]}.` });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't send the invite"),
  });

  const roleM = useMutation({
    mutationFn: ({ id, role }: { id: string; role: TenantRole }) => changeMemberRole(id, role),
    onSuccess: (res) => {
      invalidate();
      toast.success("Role updated", { description: `Now ${ROLE_LABEL[res.member.role]}.` });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't change the role"),
  });

  const removeM = useMutation({
    mutationFn: (id: string) => removeMember(id),
    onSuccess: () => {
      invalidate();
      toast.success("Member removed");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't remove the member"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your profile, team and account security." eyebrow="Account">
        <InviteDialog
          existingEmails={members.map((m) => m.email.toLowerCase())}
          seatsFull={seatsFull}
          pending={inviteM.isPending}
          onInvite={(email, role) => inviteM.mutate({ email, role })}
        />
      </PageHeader>

      <SettingsNav />

      <Card data-testid="team-members-card">
        <CardHeader>
          <CardTitle className="text-base">Team members</CardTitle>
          <CardDescription>People with access to this workspace and their roles.</CardDescription>
          <CardAction>
            <Badge variant="secondary" data-testid="team-seat-count">
              {seatUsed} / {seatCap === -1 ? "∞" : seatCap} seats
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <QueryBoundary isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()}>
            {members.length === 0 ? (
              <EmptyState
                icon="users"
                title="No team members yet"
                description="Invite teammates to collaborate on keys, billing and support."
              >
                <InviteDialog existingEmails={[]} seatsFull={seatsFull} pending={inviteM.isPending} onInvite={(email, role) => inviteM.mutate({ email, role })} />
              </EmptyState>
            ) : (
              <div className="-mx-2 overflow-x-auto sm:mx-0">
                <Table data-testid="team-members-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead className="hidden md:table-cell">Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Last active</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.id} data-testid={`team-row-${m.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="size-9">
                              <AvatarFallback>{initials(m.name)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                                {m.name}
                                {m.is_current_user && (
                                  <Badge variant="outline" className="text-[10px]">
                                    You
                                  </Badge>
                                )}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <StatusBadge status={m.status} testId={`team-status-${m.id}`} />
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground tabular-nums lg:table-cell">
                          {m.status === "invited" ? "Pending" : formatRelativeTime(m.last_active_at)}
                        </TableCell>
                        <TableCell>
                          {m.is_current_user ? (
                            <Badge variant={ROLE_VARIANT[m.role]}>{ROLE_LABEL[m.role]}</Badge>
                          ) : (
                            <Select value={m.role} onValueChange={(v) => roleM.mutate({ id: m.id, role: v as TenantRole })}>
                              <SelectTrigger className="h-8 w-[140px]" data-testid={`team-role-select-${m.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLE_OPTIONS.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {m.is_current_user ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <ConfirmDialog
                              testId={`team-remove-dialog-${m.id}`}
                              title={`Remove ${m.name}?`}
                              description={`${m.name} will immediately lose access to this workspace. This can't be undone, but you can re-invite them later.`}
                              confirmLabel="Remove member"
                              destructive
                              onConfirm={() => removeM.mutate(m.id)}
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="group text-muted-foreground hover:text-destructive"
                                  aria-label={`Remove ${m.name}`}
                                  data-testid={`team-remove-btn-${m.id}`}
                                >
                                  <Icon name="trash" size={16} />
                                </Button>
                              }
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </QueryBoundary>
        </CardContent>
      </Card>

      {/* Role reference */}
      <Card data-testid="team-roles-card">
        <CardHeader>
          <CardTitle className="text-base">What each role can do</CardTitle>
          <CardDescription>Roles control which actions a member can take.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-2">
            {ROLE_OPTIONS.map((r) => (
              <li key={r.value} className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3" data-testid={`team-role-info-${r.value}`}>
                <Badge variant={ROLE_VARIANT[r.value]} className="mt-0.5 shrink-0">
                  {r.label}
                </Badge>
                <p className="text-sm text-muted-foreground">{r.hint}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Invite member dialog ───────────────────────────────────────── */
function InviteDialog({
  existingEmails,
  seatsFull,
  pending,
  onInvite,
}: {
  existingEmails: string[];
  seatsFull: boolean;
  pending: boolean;
  onInvite: (email: string, role: TenantRole) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TenantRole>("developer");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    if (existingEmails.includes(value)) {
      setError("That person is already a member.");
      return;
    }
    onInvite(value, role);
    setEmail("");
    setRole("developer");
    setError(null);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="gradient" className="group" disabled={seatsFull} data-testid="team-invite-btn">
          <Icon name="plus" size={16} className="text-white" /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="team-invite-dialog">
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>We&apos;ll email an invitation link. They&apos;ll join with the role you choose.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@flipmart.in"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              aria-invalid={!!error}
              aria-describedby={error ? "invite-email-error" : undefined}
              data-testid="team-invite-email-input"
            />
            {error && (
              <p id="invite-email-error" className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as TenantRole)}>
              <SelectTrigger id="invite-role" data-testid="team-invite-role-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.filter((r) => r.value !== "owner").map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    <span className="flex flex-col">
                      <span>{r.label}</span>
                      <span className="text-xs text-muted-foreground">{r.hint}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" data-testid="team-invite-cancel-btn">
              Cancel
            </Button>
          </DialogClose>
          <Button variant="gradient" onClick={submit} disabled={pending} className="group" data-testid="team-invite-send-btn">
            <Icon name="send" size={16} className="text-white" /> {pending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
