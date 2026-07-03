"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  getPincodeStats,
  getPincodeSyncStatus,
  importPincodesCsv,
  runLivePincodeSync,
  searchPincodes,
} from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";
import {
  formatNumber,
  formatRelativeTime,
  formatDateTime,
} from "@/lib/format";

type ImportResult = Awaited<ReturnType<typeof importPincodesCsv>>;

export default function PincodeMasterPage() {
  // ── Stats ─────────────────────────────────────────────────────────
  const statsQ = useQuery({
    queryKey: ["admin", "pincodes", "stats"],
    queryFn: getPincodeStats,
  });
  const stats = statsQ.data;
  const lastSync = stats?.last_sync ?? null;

  // ── Search (debounced, server-side) ───────────────────────────────
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const canSearch = debounced.length >= 2;
  const searchQ = useQuery({
    queryKey: ["admin", "pincodes", "search", debounced],
    queryFn: () => searchPincodes(debounced),
    enabled: canSearch,
    placeholderData: (prev) => prev,
  });
  const results = searchQ.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Logistics data"
        title="Pincode Master"
        description="The serviceability source of truth — auto-synced nightly from the official India Post directory, with on-demand live sync and CSV import, each applied as an audited sync run."
      >
        {lastSync && (
          <StatusBadge status={lastSync.status} testId="pincode-sync-status-badge" />
        )}

        <RunLiveSyncButton />

        <ImportCsvDialog />

        <Button asChild variant="ghost" className="group" data-testid="pincode-view-logs-link">
          <Link href="/admin/pincodes/sync-logs">
            <Icon name="activity" trigger="group-hover" size={16} />
            View logs
          </Link>
        </Button>
      </PageHeader>

      <QueryBoundary
        isLoading={statsQ.isLoading}
        error={statsQ.error}
        onRetry={() => void statsQ.refetch()}
      >
        {stats && (
          <>
            {/* ── Stat tiles ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
              <StatCard
                label="Total pincodes"
                value={formatNumber(stats.total)}
                icon="database"
                hint="Master directory"
                testId="pincode-stat-total-card"
              />
              <StatCard
                label="Metro pincodes"
                value={formatNumber(stats.metros)}
                icon="map"
                hint="Flagged is_metro"
                testId="pincode-stat-metros-card"
              />
              <StatCard
                label="Remote pincodes"
                value={formatNumber(stats.remote)}
                icon="pin"
                hint="Flagged is_remote"
                testId="pincode-stat-remote-card"
              />
              <StatCard
                label="States covered"
                value={formatNumber(stats.states)}
                icon="globe"
                hint="Distinct states"
                testId="pincode-stat-states-card"
              />
              <StatCard
                label="Last sync"
                value={lastSync ? formatRelativeTime(lastSync.started_at) : "No syncs yet"}
                icon="clock"
                hint={
                  lastSync
                    ? `${formatDateTime(lastSync.started_at)} · ${lastSync.status} · ${lastSync.trigger}`
                    : "Import a CSV to run the first sync"
                }
                testId="pincode-stat-lastsync-card"
              />
            </div>

            {/* ── Latest sync run + operations ───────────────────── */}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2" data-testid="pincode-sync-progress-card">
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <span className="grid size-8 place-items-center rounded-lg bg-brand-gradient-soft text-primary">
                        <Icon name="sync" trigger="hover" size={16} />
                      </span>
                      Latest sync run
                    </CardTitle>
                    <CardDescription>
                      Every CSV import is recorded as a sync run with full counts.
                    </CardDescription>
                  </div>
                  {lastSync && (
                    <StatusBadge status={lastSync.status} testId="pincode-sync-phase-badge" />
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {lastSync ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant="secondary" className="capitalize" data-testid="pincode-lastsync-trigger-badge">
                          {lastSync.trigger.replace(/_/g, " ")}
                        </Badge>
                        <span
                          className="font-mono text-xs tabular-nums text-muted-foreground"
                          data-testid="pincode-lastsync-started"
                        >
                          {formatDateTime(lastSync.started_at)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        <CountTile
                          label="Scanned"
                          value={formatNumber(lastSync.counts.scanned)}
                          testId="pincode-lastsync-count-scanned"
                        />
                        <CountTile
                          label="Added"
                          value={`+${formatNumber(lastSync.counts.added)}`}
                          tone="success"
                          testId="pincode-lastsync-count-added"
                        />
                        <CountTile
                          label="Updated"
                          value={`~${formatNumber(lastSync.counts.updated)}`}
                          tone="info"
                          testId="pincode-lastsync-count-updated"
                        />
                        <CountTile
                          label="Removed"
                          value={`−${formatNumber(lastSync.counts.removed)}`}
                          testId="pincode-lastsync-count-removed"
                        />
                        <CountTile
                          label="Failed"
                          value={`✕${formatNumber(lastSync.counts.failed)}`}
                          tone={lastSync.counts.failed > 0 ? "destructive" : undefined}
                          testId="pincode-lastsync-count-failed"
                        />
                      </div>
                      <Button asChild variant="ghost" size="sm" className="group">
                        <Link href="/admin/pincodes/sync-logs" data-testid="pincode-sync-viewlog-link">
                          <Icon name="external" trigger="group-hover" size={15} />
                          View run history
                        </Link>
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground" data-testid="pincode-no-syncs-note">
                      No syncs yet — import a CSV to seed the pincode master.
                    </p>
                  )}
                  <p
                    className="text-xs text-muted-foreground"
                    data-testid="pincode-sync-comingsoon-note"
                  >
                    Auto-syncs nightly from the official India Post directory. Use{" "}
                    <span className="font-medium text-foreground">Run live sync</span> for an
                    on-demand refresh, or CSV import for one-off updates.
                  </p>
                </CardContent>
              </Card>

              <Card data-testid="pincode-sync-ops-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-lg bg-brand-gradient-soft text-primary">
                      <Icon name="settings" size={16} />
                    </span>
                    Sync operations
                  </CardTitle>
                  <CardDescription>
                    Imports upsert records by pincode and are fully audited.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Configure the sync source, schedule and notifications, or review the
                    forensic history of every run.
                  </p>
                  <Separator />
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="group w-full"
                    data-testid="pincode-sync-settings-link"
                  >
                    <Link href="/admin/pincodes/sync-settings">
                      <Icon name="settings" trigger="group-hover" size={15} />
                      Sync settings
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="group w-full"
                    data-testid="pincode-sync-logs-card-link"
                  >
                    <Link href="/admin/pincodes/sync-logs">
                      <Icon name="audit" trigger="group-hover" size={15} />
                      Sync logs
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </QueryBoundary>

      {/* ── Pincode explorer ─────────────────────────────────────── */}
      <Card data-testid="pincode-explorer-card">
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle>Pincode explorer</CardTitle>
            <CardDescription>
              Search across pincode, office, district and state — minimum 2 characters.
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-80">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Icon name="search" size={15} />
            </span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 302001, Jaipur, Rajasthan…"
              className="pl-9"
              aria-label="Search pincodes"
              data-testid="pincode-search-input"
            />
          </div>
        </CardHeader>
        <CardContent>
          {!canSearch ? (
            <EmptyState
              icon="search"
              title="Search the pincode master"
              description="Type at least two characters — a pincode, office name, district or state — to look up live records."
              testId="pincode-search-hint"
            />
          ) : (
            <QueryBoundary
              isLoading={searchQ.isLoading}
              error={searchQ.error}
              onRetry={() => void searchQ.refetch()}
            >
              {results.length === 0 ? (
                <EmptyState
                  icon="search"
                  title="No pincodes match"
                  description={`Nothing found for "${debounced}". Try a different pincode, office or state.`}
                  testId="pincode-empty-state"
                >
                  <Button
                    variant="outline"
                    className="group"
                    onClick={() => setQuery("")}
                    data-testid="pincode-clear-search-btn"
                  >
                    <Icon name="filter" trigger="group-hover" size={15} />
                    Clear search
                  </Button>
                </EmptyState>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table data-testid="pincode-table">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pincode</TableHead>
                          <TableHead>Office</TableHead>
                          <TableHead className="hidden md:table-cell">District</TableHead>
                          <TableHead className="hidden lg:table-cell">State</TableHead>
                          <TableHead>Serviceable</TableHead>
                          <TableHead className="hidden xl:table-cell">Source</TableHead>
                          <TableHead className="hidden sm:table-cell">Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((p) => (
                          <TableRow key={p.pincode} data-testid={`pincode-row-${p.pincode}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold tabular-nums">
                                  {p.pincode}
                                </span>
                                {p.is_metro && (
                                  <Badge
                                    variant="secondary"
                                    data-testid={`pincode-metro-${p.pincode}`}
                                  >
                                    Metro
                                  </Badge>
                                )}
                                {p.is_remote && (
                                  <Badge
                                    variant="warning"
                                    data-testid={`pincode-remote-${p.pincode}`}
                                  >
                                    Remote
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="font-medium">{p.office_name}</p>
                              {p.city && (
                                <p className="text-xs text-muted-foreground">{p.city}</p>
                              )}
                            </TableCell>
                            <TableCell className="hidden text-muted-foreground md:table-cell">
                              {p.district}
                            </TableCell>
                            <TableCell className="hidden text-muted-foreground lg:table-cell">
                              {p.state}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={p.serviceable ? "success" : "muted"}
                                data-testid={`pincode-serviceable-${p.pincode}`}
                              >
                                {p.serviceable ? "Serviceable" : "Not serviceable"}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden xl:table-cell">
                              <span className="font-mono text-xs uppercase text-muted-foreground">
                                {p.source}
                              </span>
                            </TableCell>
                            <TableCell className="hidden text-muted-foreground sm:table-cell">
                              {formatRelativeTime(p.updated_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p
                    className="mt-3 text-sm text-muted-foreground"
                    data-testid="pincode-pagination-range"
                  >
                    Showing the top{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {results.length}
                    </span>{" "}
                    match{results.length === 1 ? "" : "es"} for{" "}
                    <span className="font-medium text-foreground">&ldquo;{debounced}&rdquo;</span>
                    {results.length >= 20 ? " — refine the search to narrow down further." : "."}
                  </p>
                </>
              )}
            </QueryBoundary>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Small count tile used in the latest-sync card ─────────────────── */
function CountTile({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: "success" | "info" | "destructive";
  testId: string;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "info"
        ? "text-info"
        : tone === "destructive"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div
      className="rounded-xl border border-border bg-background px-3.5 py-3"
      data-testid={testId}
    >
      <p className={`font-mono text-lg font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/* ── Live-sync trigger (single-flight; polls server status) ─────────── */
function RunLiveSyncButton() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  // Remember the run we last saw as "running" so we can toast when it finishes.
  const wasRunning = React.useRef(false);

  const statusQ = useQuery({
    queryKey: ["admin", "pincodes", "sync-status"],
    queryFn: getPincodeSyncStatus,
    // Poll every 3s while a run is in progress; back off to 30s when idle.
    refetchInterval: (q) => (q.state.data?.running ? 3000 : 30_000),
    refetchOnWindowFocus: true,
  });
  const running = statusQ.data?.running ?? false;

  // Detect the running → finished transition and report the outcome once.
  React.useEffect(() => {
    if (running) {
      wasRunning.current = true;
      return;
    }
    if (wasRunning.current) {
      wasRunning.current = false;
      const last = statusQ.data?.last;
      void qc.invalidateQueries({ queryKey: ["admin", "pincodes"] });
      if (last?.status === "success") {
        toast.success(
          `Sync complete — +${formatNumber(last.counts.added)} added, ${formatNumber(last.counts.updated)} updated.`,
        );
      } else if (last?.status === "failed") {
        toast.error(`Sync failed — ${last.error ?? "see the sync logs"}.`);
      }
    }
  }, [running, statusQ.data?.last, qc]);

  const syncM = useMutation({
    mutationFn: runLivePincodeSync,
    onSuccess: () => {
      // Fire-and-forget on the server (202) — begin polling for progress.
      wasRunning.current = true;
      void qc.invalidateQueries({ queryKey: ["admin", "pincodes", "sync-status"] });
      void statusQ.refetch();
      toast.success("Live sync started — this runs in the background.");
      setOpen(false);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "sync_not_configured") {
        toast.error("Live sync isn't configured — set DATA_GOV_IN_API_KEY on the API to enable it.");
      } else if (e instanceof ApiError && e.code === "sync_in_progress") {
        toast.error("A sync is already running — wait for it to finish.");
        void statusQ.refetch();
      } else {
        toast.error(e instanceof ApiError ? e.message : "Couldn't start the live sync.");
      }
      setOpen(false);
    },
  });

  const busy = running || syncM.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <Button
          variant="gradient"
          className="group"
          disabled={busy}
          aria-busy={busy}
          data-testid="pincode-livesync-run-btn"
        >
          <Icon
            name="sync"
            trigger={busy ? "loop" : "group-hover"}
            animation={busy ? "spin" : undefined}
            size={16}
            className="text-white"
          />
          {running ? "Syncing…" : "Run live sync"}
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="pincode-livesync-dialog">
        <DialogHeader>
          <DialogTitle>Run India Post live sync?</DialogTitle>
          <DialogDescription>
            This pulls the full All India Pincode Directory from the official data.gov.in
            (Department of Posts) source and upserts every pincode. It runs in the background —
            you can leave this page. Only one sync runs at a time; the button stays disabled until
            it finishes.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" data-testid="pincode-livesync-cancel-btn">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="gradient"
            className="group"
            disabled={busy}
            onClick={() => syncM.mutate()}
            data-testid="pincode-livesync-confirm-btn"
          >
            <Icon
              name="sync"
              trigger={syncM.isPending ? "loop" : "group-hover"}
              size={16}
              className="text-white"
            />
            {syncM.isPending ? "Starting…" : "Start live sync"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportCsvDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [csv, setCsv] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  const importM = useMutation({
    mutationFn: (text: string) => importPincodesCsv(text),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["admin", "pincodes"] });
      toast.success(
        `Import complete — +${formatNumber(res.counts.added)} added, ${formatNumber(res.counts.updated)} updated, ${formatNumber(res.counts.failed)} failed`,
      );
      setResult(res);
      if (res.failed_records.length === 0) {
        resetFile();
        setOpen(false);
      }
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "CSV import failed — nothing was applied"),
  });

  function resetFile() {
    setFileName(null);
    setCsv(null);
    setResult(null);
  }

  // Keep in lockstep with the server route's z.string().max(5_000_000) cap.
  const MAX_CSV_BYTES = 5_000_000;

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) {
      setFileName(null);
      setCsv(null);
      return;
    }
    if (file.size > MAX_CSV_BYTES) {
      toast.error(
        `"${file.name}" is ${(file.size / 1e6).toFixed(1)} MB — the import limit is 5 MB. Split the CSV and import it in parts.`,
      );
      e.target.value = "";
      setFileName(null);
      setCsv(null);
      return;
    }
    setFileName(file.name);
    setCsv(null);
    const reader = new FileReader();
    reader.onload = () => setCsv(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => {
      toast.error("Couldn't read the selected file");
      setFileName(null);
      setCsv(null);
    };
    reader.readAsText(file);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetFile();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="group" data-testid="pincode-sync-run-btn">
          <Icon name="upload" trigger="group-hover" size={16} />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="pincode-import-dialog">
        <DialogHeader>
          <DialogTitle>Import pincodes from CSV</DialogTitle>
          <DialogDescription>
            Rows are upserted by pincode and the run is recorded in the sync logs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pincode-csv-file">CSV file</Label>
            <Input
              id="pincode-csv-file"
              type="file"
              accept=".csv"
              onChange={onFileChange}
              data-testid="pincode-csv-file-input"
            />
            <p className="text-xs text-muted-foreground">
              Header row required. Recognised columns: pincode, officename, district, state,
              city, ismetro, isremote.
            </p>
            <p className="text-xs text-muted-foreground">
              Prefer <span className="font-medium text-foreground">Run live sync</span> to pull the
              full official India Post directory. CSV import is for one-off or offline updates.
            </p>
          </div>
          {fileName && !result && (
            <div
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
              data-testid="pincode-csv-selected"
            >
              <Icon name="check" size={15} className="text-success" />
              <span className="font-medium">{fileName}</span>
              <span className="text-muted-foreground">
                {csv ? "ready to import" : "reading file…"}
              </span>
            </div>
          )}
          {result && result.failed_records.length > 0 && (
            <div
              className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5"
              data-testid="pincode-import-failed-list"
            >
              <p className="text-sm font-medium">
                {formatNumber(result.counts.failed)} row
                {result.counts.failed === 1 ? "" : "s"} failed —{" "}
                <span className="text-success">+{formatNumber(result.counts.added)} added</span>,{" "}
                <span className="text-info">~{formatNumber(result.counts.updated)} updated</span>
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {result.failed_records.map((fr) => (
                  <li
                    key={fr.line}
                    className="font-mono"
                    data-testid={`pincode-import-failed-row-${fr.line}`}
                  >
                    Line {fr.line}: {fr.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" data-testid="pincode-import-cancel-btn">
              {result ? "Close" : "Cancel"}
            </Button>
          </DialogClose>
          <Button
            variant="gradient"
            className="group"
            disabled={!csv || importM.isPending}
            data-testid="pincode-import-apply-btn"
            onClick={() => {
              if (csv) importM.mutate(csv);
            }}
          >
            <Icon
              name={importM.isPending ? "sync" : "upload"}
              trigger={importM.isPending ? "loop" : "group-hover"}
              size={16}
              className="text-white"
            />
            {importM.isPending ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
