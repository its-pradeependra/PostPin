"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { CopyButton } from "@/components/shared/copy-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getKey, revokeKey, updateKey, type ApiKeyDto } from "@/lib/api/services/keys";
import { getUsageLogs } from "@/lib/api/services/usage";
import { ApiError } from "@/lib/api/errors";
import { formatNumber, formatDate, formatRelativeTime, formatLatency } from "@/lib/format";

function EnvBadge({ mode }: { mode: "live" | "test" }) {
  return mode === "live" ? <Badge variant="gradient">Live</Badge> : <Badge variant="warning">Test</Badge>;
}

export function KeyDetail({ keyId }: { keyId: string }) {
  const qc = useQueryClient();
  const keyQ = useQuery({ queryKey: ["keys", keyId], queryFn: () => getKey(keyId) });
  const logsQ = useQuery({ queryKey: ["usage", "logs", "key", keyId], queryFn: () => getUsageLogs(20, keyId) });

  const apiKey = keyQ.data;
  const [domainsEdit, setDomainsEdit] = React.useState<string[] | null>(null);
  const [newDomain, setNewDomain] = React.useState("");

  const domains = domainsEdit ?? apiKey?.allowed_domains ?? [];
  const dirty = domainsEdit !== null && JSON.stringify(domainsEdit) !== JSON.stringify(apiKey?.allowed_domains ?? []);

  const saveM = useMutation({
    mutationFn: (allowed_domains: string[]) => updateKey(keyId, { allowed_domains }),
    onSuccess: () => {
      setDomainsEdit(null);
      void qc.invalidateQueries({ queryKey: ["keys"] });
      toast.success("Allowed domains updated");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't update domains"),
  });

  const revokeM = useMutation({
    mutationFn: () => revokeKey(keyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["keys"] });
      toast.success("Key revoked");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't revoke key"),
  });

  function addDomain() {
    const d = newDomain.trim().toLowerCase();
    if (!d) return;
    if (domains.includes(d)) {
      toast.error("Domain already added");
      return;
    }
    setDomainsEdit([...domains, d]);
    setNewDomain("");
  }
  function removeDomain(d: string) {
    setDomainsEdit(domains.filter((x) => x !== d));
  }

  return (
    <div className="space-y-6">
      <Link
        href="/app/keys"
        className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        data-testid="key-detail-back-link"
      >
        <Icon name="arrowRight" trigger="group-hover" size={14} className="rotate-180" />
        Back to API keys
      </Link>

      <QueryBoundary isLoading={keyQ.isLoading} error={keyQ.error} onRetry={() => void keyQ.refetch()}>
        {apiKey && (
          <>
            <PageHeader eyebrow="Develop" title={apiKey.name} description={`Key ID: ${apiKey.id}`}>
              <EnvBadge mode={apiKey.mode} />
              <StatusBadge status={apiKey.status} testId="key-detail-status" />
              <ConfirmDialog
                trigger={
                  <Button
                    variant="destructive"
                    className="group"
                    disabled={apiKey.status === "revoked"}
                    data-testid="key-detail-revoke-btn"
                  >
                    <Icon name="trash" trigger="group-hover" size={16} className="text-white" />
                    Revoke
                  </Button>
                }
                title={`Revoke "${apiKey.name}"?`}
                description="Revoking is immediate and irreversible. Applications using this key will receive 401 errors."
                confirmLabel="Revoke key"
                destructive
                onConfirm={() => revokeM.mutate()}
                testId="key-detail-revoke-dialog"
              />
            </PageHeader>

            <Tabs defaultValue="overview" className="space-y-5">
              <TabsList data-testid="key-detail-tabs">
                <TabsTrigger value="overview" data-testid="key-detail-tab-overview">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="domains" data-testid="key-detail-tab-domains">
                  Allowed domains
                </TabsTrigger>
                <TabsTrigger value="usage" data-testid="key-detail-tab-usage">
                  Usage
                </TabsTrigger>
              </TabsList>

              {/* Overview */}
              <TabsContent value="overview" className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card data-testid="key-detail-secret-card" className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Key secret</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 rounded-xl border border-border bg-popover px-3 py-2.5">
                        <code className="flex-1 truncate font-mono text-sm text-foreground">{apiKey.masked}</code>
                        <CopyButton value={apiKey.masked} label="Copy" testId="key-detail-copy-btn" toastMessage="Masked key copied" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The full secret was only shown once at creation. Rotate the key from the keys list to issue a new
                        secret if it was lost.
                      </p>
                    </CardContent>
                  </Card>

                  <Card data-testid="key-detail-meta-card">
                    <CardHeader>
                      <CardTitle>Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <dl className="space-y-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">Created</dt>
                          <dd className="font-medium">{formatDate(apiKey.created_at)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">Last used</dt>
                          <dd className="font-medium">
                            {apiKey.last_used_at ? formatRelativeTime(apiKey.last_used_at) : "Never"}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">Total requests</dt>
                          <dd className="font-mono font-medium tabular-nums">{formatNumber(apiKey.request_count)}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt className="text-muted-foreground">Environment</dt>
                          <dd>
                            <EnvBadge mode={apiKey.mode} />
                          </dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Allowed domains */}
              <TabsContent value="domains">
                <Card data-testid="key-detail-domains-card">
                  <CardHeader>
                    <CardTitle>Allowed domains</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        placeholder="e.g. shop.flipmart.in or *.flipmart.in"
                        value={newDomain}
                        onChange={(e) => setNewDomain(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addDomain();
                          }
                        }}
                        className="font-mono text-[13px]"
                        data-testid="key-detail-domain-input"
                      />
                      <Button variant="secondary" onClick={addDomain} className="group shrink-0" data-testid="key-detail-domain-add-btn">
                        <Icon name="plus" trigger="group-hover" size={16} />
                        Add domain
                      </Button>
                    </div>

                    {domains.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                        No domains yet — this key is unrestricted and can be used from anywhere.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border rounded-xl border border-border">
                        {domains.map((d) => (
                          <li key={d} className="group flex items-center justify-between gap-3 px-4 py-2.5" data-testid={`key-detail-domain-${d}`}>
                            <code className="truncate font-mono text-sm">{d}</code>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="group/btn text-muted-foreground hover:text-destructive"
                              onClick={() => removeDomain(d)}
                              aria-label={`Remove ${d}`}
                              data-testid={`key-detail-domain-remove-${d}`}
                            >
                              <Icon name="close" trigger="group-hover" size={16} />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                      <Button variant="outline" disabled={!dirty} onClick={() => setDomainsEdit(null)} data-testid="key-detail-domain-reset-btn">
                        Reset
                      </Button>
                      <Button
                        variant="gradient"
                        disabled={!dirty || saveM.isPending}
                        onClick={() => saveM.mutate(domains)}
                        data-testid="key-detail-domain-save-btn"
                      >
                        {saveM.isPending ? "Saving…" : "Save changes"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Usage */}
              <TabsContent value="usage" className="space-y-5">
                <Card className="overflow-hidden p-0" data-testid="key-detail-recent-calls">
                  <CardHeader className="px-5 pt-5">
                    <CardTitle>Recent requests through this key</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 pb-0">
                    <QueryBoundary isLoading={logsQ.isLoading} error={logsQ.error} onRetry={() => void logsQ.refetch()}>
                      {(logsQ.data ?? []).length === 0 ? (
                        <p className="px-5 pb-6 text-sm text-muted-foreground">No requests through this key yet.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Route</TableHead>
                              <TableHead>Shipment</TableHead>
                              <TableHead className="text-right">Status</TableHead>
                              <TableHead className="text-right">Latency</TableHead>
                              <TableHead className="text-right">When</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(logsQ.data ?? []).map((c) => (
                              <TableRow key={c.id} data-testid={`key-detail-call-${c.id}`}>
                                <TableCell className="font-mono text-xs">
                                  {c.method} {c.endpoint}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                  {c.detail?.origin ? `${c.detail.origin} → ${c.detail.destination}` : "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Badge variant={c.status < 300 ? "success" : c.status < 500 ? "warning" : "destructive"} className="font-mono">
                                    {c.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-mono text-sm tabular-nums">{formatLatency(c.latency_ms)}</TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground">{formatRelativeTime(c.at)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </QueryBoundary>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
