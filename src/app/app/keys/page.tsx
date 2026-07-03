"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CopyButton } from "@/components/shared/copy-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { createKey, listKeys, revokeKey, rotateKey, type ApiKeyDto } from "@/lib/api/services/keys";
import { ApiError } from "@/lib/api/errors";
import { formatDate, formatNumber, formatRelativeTime } from "@/lib/format";

type EnvFilter = "all" | "live" | "test";

function EnvBadge({ mode }: { mode: "live" | "test" }) {
  return mode === "live" ? (
    <Badge variant="gradient" data-testid={`key-env-${mode}`}>
      Live
    </Badge>
  ) : (
    <Badge variant="warning" data-testid={`key-env-${mode}`}>
      Test
    </Badge>
  );
}

function DomainChips({ domains, keyId }: { domains: string[]; keyId: string }) {
  if (domains.length === 0) {
    return (
      <Badge variant="warning" data-testid={`key-unrestricted-badge-${keyId}`}>
        <Icon name="shield" size={12} /> Unrestricted
      </Badge>
    );
  }
  const shown = domains.slice(0, 2);
  const rest = domains.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((d) => (
        <Badge key={d} variant="muted" className="max-w-[10rem] font-mono text-[11px]">
          <span className="truncate">{d}</span>
        </Badge>
      ))}
      {rest > 0 && (
        <Badge variant="outline" className="text-[11px]">
          +{rest}
        </Badge>
      )}
    </div>
  );
}

/** One-time secret reveal panel (shared by create + rotate). */
function SecretReveal({
  secret,
  testId,
  onDone,
}: {
  secret: string;
  testId: string;
  onDone: () => void;
}) {
  const [acknowledged, setAcknowledged] = React.useState(false);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Save your API key</DialogTitle>
        <DialogDescription>
          This secret is shown only once. Store it somewhere safe — you won&apos;t be able to see it again.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-popover px-3 py-2.5">
          <code className="flex-1 truncate font-mono text-sm text-foreground" data-testid={testId}>
            {secret}
          </code>
          <CopyButton value={secret} label="Copy" testId={`${testId}-copy`} toastMessage="Secret copied — store it safely" />
        </div>
        <Alert variant="destructive">
          <Icon name="shield" size={16} />
          <AlertTitle>You won&apos;t see this again</AlertTitle>
          <AlertDescription>If you lose this key, rotate it to issue a new secret.</AlertDescription>
        </Alert>
        <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 size-4 rounded border-border accent-primary"
            data-testid={`${testId}-ack`}
          />
          I have stored this key securely.
        </label>
      </div>
      <DialogFooter>
        <Button variant="gradient" disabled={!acknowledged} onClick={onDone} data-testid={`${testId}-done`}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

/* ── Create key dialog ──────────────────────────────────────────── */
function CreateKeyDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [mode, setMode] = React.useState<"live" | "test">("test");
  const [domains, setDomains] = React.useState("");
  const [secret, setSecret] = React.useState<string | null>(null);
  const nameValid = name.trim().length >= 2 && name.trim().length <= 60;

  const mutation = useMutation({
    mutationFn: createKey,
    onSuccess: (res) => {
      setSecret(res.secret);
      void qc.invalidateQueries({ queryKey: ["keys"] });
      toast.success("API key created — copy your secret now");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't create key"),
  });

  function reset() {
    setName("");
    setMode("test");
    setDomains("");
    setSecret(null);
    mutation.reset();
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setTimeout(reset, 200);
  }

  function handleCreate() {
    if (!nameValid) return;
    const allowed_domains = domains
      .split(/[\n,]/)
      .map((d) => d.trim())
      .filter(Boolean);
    mutation.mutate({ name: name.trim(), mode, allowed_domains });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="gradient" className="group" data-testid="key-create-btn">
          <Icon name="plus" trigger="group-hover" size={16} className="text-white" />
          Create key
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg" data-testid="key-create-dialog">
        {secret ? (
          <SecretReveal secret={secret} testId="key-create-secret" onDone={() => handleOpenChange(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                Name the key, pick an environment, and optionally restrict it to your domains.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="key-name">Key name</Label>
                <Input
                  id="key-name"
                  placeholder="e.g. Production — storefront"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="key-create-name-input"
                />
                <p className="text-xs text-muted-foreground">
                  2–60 characters. Use a name that describes where this key runs.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="key-env">Environment</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as "live" | "test")}>
                  <SelectTrigger id="key-env" data-testid="key-create-env-select">
                    <SelectValue placeholder="Select environment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="test" data-testid="key-create-env-test">
                      Test — sandbox, no billing impact
                    </SelectItem>
                    <SelectItem value="live" data-testid="key-create-env-live">
                      Live — production traffic
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="key-domains">Allowed domains</Label>
                <Textarea
                  id="key-domains"
                  placeholder={"flipmart.in\n*.flipmart.in"}
                  rows={3}
                  value={domains}
                  onChange={(e) => setDomains(e.target.value)}
                  className="font-mono text-[13px]"
                  data-testid="key-create-domains-input"
                />
                <p className="text-xs text-muted-foreground">
                  One per line. Leave blank for an unrestricted key (not recommended for Live).
                </p>
              </div>
              {mode === "live" && domains.trim() === "" && (
                <Alert variant="warning">
                  <Icon name="shield" size={16} />
                  <AlertDescription>
                    A Live key with no domain restrictions can be used from anywhere. Add at least one domain for safety.
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)} data-testid="key-create-cancel-btn">
                Cancel
              </Button>
              <Button
                variant="gradient"
                disabled={!nameValid || mutation.isPending}
                onClick={handleCreate}
                data-testid="key-create-submit-btn"
              >
                {mutation.isPending ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Row actions ────────────────────────────────────────────────── */
function RowActions({
  apiKey,
  onRotate,
  onRevoke,
}: {
  apiKey: ApiKeyDto;
  onRotate: (id: string) => void;
  onRevoke: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="group"
          aria-label={`Actions for ${apiKey.name}`}
          data-testid={`key-row-actions-${apiKey.id}`}
        >
          <Icon name="more" trigger="group-hover" size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Manage key</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={`/app/keys/${apiKey.id}`} data-testid={`key-action-view-${apiKey.id}`}>
            <Icon name="eye" size={16} /> View
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            navigator.clipboard?.writeText(apiKey.id);
            toast.success("Key ID copied");
          }}
          data-testid={`key-action-copy-${apiKey.id}`}
        >
          <Icon name="copy" size={16} /> Copy ID
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={apiKey.status === "revoked"}
          onSelect={() => onRotate(apiKey.id)}
          data-testid={`key-action-rotate-${apiKey.id}`}
        >
          <Icon name="sync" size={16} /> Rotate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ConfirmDialog
          trigger={
            <DropdownMenuItem
              variant="destructive"
              disabled={apiKey.status === "revoked"}
              onSelect={(e) => e.preventDefault()}
              data-testid={`key-action-revoke-${apiKey.id}`}
            >
              <Icon name="trash" size={16} /> Revoke
            </DropdownMenuItem>
          }
          title={`Revoke "${apiKey.name}"?`}
          description="Revoking is immediate and irreversible. Any application using this key will start receiving 401 errors."
          confirmLabel="Revoke key"
          destructive
          onConfirm={() => onRevoke(apiKey.id)}
          testId={`key-revoke-dialog-${apiKey.id}`}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function ApiKeysPage() {
  const qc = useQueryClient();
  const { data: keys = [], isLoading, error, refetch } = useQuery({ queryKey: ["keys"], queryFn: listKeys });
  const [envFilter, setEnvFilter] = React.useState<EnvFilter>("all");
  const [query, setQuery] = React.useState("");
  const [rotatedSecret, setRotatedSecret] = React.useState<string | null>(null);

  const rotateM = useMutation({
    mutationFn: rotateKey,
    onSuccess: (res) => {
      setRotatedSecret(res.secret);
      void qc.invalidateQueries({ queryKey: ["keys"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't rotate key"),
  });

  const revokeM = useMutation({
    mutationFn: revokeKey,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["keys"] });
      toast.success("Key revoked");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't revoke key"),
  });

  const filtered = keys.filter((k) => {
    const envOk = envFilter === "all" || k.mode === envFilter;
    const q = query.trim().toLowerCase();
    const queryOk =
      q === "" || k.name.toLowerCase().includes(q) || k.allowed_domains.some((d) => d.toLowerCase().includes(q));
    return envOk && queryOk;
  });

  const activeCount = keys.filter((k) => k.status === "active").length;
  const unrestricted = keys.filter((k) => k.status === "active" && k.allowed_domains.length === 0).length;
  const totalRequests = keys.reduce((a, k) => a + (k.request_count ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Develop"
        title="API Keys"
        description="Create and manage keys for your Postpin integrations. Secrets are revealed only once."
      >
        <CreateKeyDialog />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4" data-testid="key-summary-active">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active keys</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums">{activeCount}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Currently usable</p>
        </Card>
        <Card className="p-4" data-testid="key-summary-calls">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total requests</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums">{formatNumber(totalRequests)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Across all keys</p>
        </Card>
        <Card className="p-4" data-testid="key-summary-unrestricted">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unrestricted keys</p>
          <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${unrestricted > 0 ? "text-warning" : ""}`}>
            {unrestricted}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {unrestricted > 0 ? "Add domain restrictions" : "All keys restricted"}
          </p>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Icon name="search" size={16} />
          </span>
          <Input
            placeholder="Search by name or domain"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            data-testid="key-search-input"
          />
        </div>
        <Select value={envFilter} onValueChange={(v) => setEnvFilter(v as EnvFilter)}>
          <SelectTrigger className="w-full sm:w-44" data-testid="key-env-filter">
            <SelectValue placeholder="Environment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All environments</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="test">Test</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <QueryBoundary isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {filtered.length === 0 ? (
          <EmptyState
            icon="keys"
            title={keys.length === 0 ? "No API keys yet" : "No keys match your filters"}
            description={
              keys.length === 0
                ? "Create your first key to start calling the Postpin API."
                : "Try a different environment or clear your search."
            }
            testId="key-empty-state"
          >
            {keys.length === 0 ? (
              <CreateKeyDialog />
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setEnvFilter("all");
                }}
                data-testid="key-clear-filters-btn"
              >
                Clear filters
              </Button>
            )}
          </EmptyState>
        ) : (
          <>
            <Card className="hidden overflow-hidden p-0 md:block" data-testid="key-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Env</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Allowed domains</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((k) => (
                    <TableRow key={k.id} className="group" data-testid={`key-row-${k.id}`}>
                      <TableCell>
                        <Link
                          href={`/app/keys/${k.id}`}
                          className="font-medium text-foreground hover:text-primary"
                          data-testid={`key-name-link-${k.id}`}
                        >
                          {k.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">Created {formatDate(k.created_at)}</p>
                      </TableCell>
                      <TableCell>
                        <EnvBadge mode={k.mode} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs text-muted-foreground">{k.masked}</code>
                          <CopyButton value={k.masked} testId={`key-copy-btn-${k.id}`} toastMessage="Masked key copied" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <DomainChips domains={k.allowed_domains} keyId={k.id} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatNumber(k.request_count)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {k.last_used_at ? formatRelativeTime(k.last_used_at) : "Never"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={k.status} testId={`key-status-${k.id}`} />
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions apiKey={k} onRotate={(id) => rotateM.mutate(id)} onRevoke={(id) => revokeM.mutate(id)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <div className="grid gap-3 md:hidden">
              {filtered.map((k) => (
                <Card key={k.id} className="group p-4" data-testid={`key-card-${k.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/app/keys/${k.id}`}
                        className="font-medium text-foreground hover:text-primary"
                        data-testid={`key-card-name-link-${k.id}`}
                      >
                        {k.name}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <EnvBadge mode={k.mode} />
                        <StatusBadge status={k.status} />
                      </div>
                    </div>
                    <RowActions apiKey={k} onRotate={(id) => rotateM.mutate(id)} onRevoke={(id) => revokeM.mutate(id)} />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <code className="flex-1 truncate font-mono text-xs text-muted-foreground">{k.masked}</code>
                    <CopyButton value={k.masked} testId={`key-card-copy-btn-${k.id}`} toastMessage="Masked key copied" />
                  </div>
                  <div className="mt-3">
                    <DomainChips domains={k.allowed_domains} keyId={k.id} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums">{formatNumber(k.request_count)} req</span>
                    <span>{k.last_used_at ? formatRelativeTime(k.last_used_at) : "Never used"}</span>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </QueryBoundary>

      {/* Rotate → reveal the new secret once */}
      <Dialog open={rotatedSecret !== null} onOpenChange={(o) => !o && setRotatedSecret(null)}>
        <DialogContent className="max-w-lg" data-testid="key-rotate-dialog">
          {rotatedSecret && (
            <SecretReveal secret={rotatedSecret} testId="key-rotate-secret" onDone={() => setRotatedSecret(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
