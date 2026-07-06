"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { disable2fa, enable2fa, get2faStatus, setup2fa } from "@/lib/api/services/account";
import { ApiError } from "@/lib/api/errors";

/** TOTP two-factor enrollment card — shared by the admin team page ("Your 2FA")
 * and the tenant security page. The /auth/2fa endpoints are account-scoped, so
 * the same flow works for platform staff and tenant users alike. */
export function TwoFactorCard({
  testIdPrefix = "account-2fa",
  description = "Protect your account with a TOTP authenticator app.",
}: {
  testIdPrefix?: string;
  description?: string;
}) {
  const qc = useQueryClient();
  const statusQ = useQuery({ queryKey: ["account", "2fa"], queryFn: get2faStatus });
  const [setup, setSetup] = React.useState<{ otpauth: string; qr_data_url: string } | null>(null);
  const [code, setCode] = React.useState("");
  const [backupCodes, setBackupCodes] = React.useState<string[] | null>(null);
  const [disableCode, setDisableCode] = React.useState("");
  const tid = (s: string) => `${testIdPrefix}-${s}`;

  const setupM = useMutation({
    mutationFn: setup2fa,
    onSuccess: (r) => setSetup(r),
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't start 2FA setup"),
  });
  const enableM = useMutation({
    mutationFn: () => enable2fa(code.trim()),
    onSuccess: (r) => {
      setBackupCodes(r.backup_codes);
      setSetup(null);
      setCode("");
      void qc.invalidateQueries({ queryKey: ["account", "2fa"] });
      toast.success("Two-factor authentication is on.");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "That code didn't verify"),
  });
  const disableM = useMutation({
    mutationFn: () => disable2fa(disableCode.trim()),
    onSuccess: () => {
      setDisableCode("");
      setBackupCodes(null);
      void qc.invalidateQueries({ queryKey: ["account", "2fa"] });
      toast.success("Two-factor authentication disabled.");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "That code didn't verify"),
  });

  const enabled = statusQ.data?.enabled ?? false;

  return (
    <Card data-testid={tid("card")}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Two-factor authentication</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant={enabled ? "gradient" : "muted"} data-testid={tid("status-badge")}>
            {enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </CardHeader>

      <QueryBoundary isLoading={statusQ.isLoading} error={statusQ.error} onRetry={() => void statusQ.refetch()}>
        <CardContent className="space-y-4">
          {backupCodes && (
            <Alert data-testid={tid("backup-codes")}>
              <Icon name="shieldCheck" size={16} />
              <AlertTitle>Save your backup codes</AlertTitle>
              <AlertDescription>
                <p className="mb-2">Each code works once if you lose your device. Store them safely.</p>
                <div className="grid grid-cols-2 gap-1 font-mono text-sm sm:grid-cols-4">
                  {backupCodes.map((c) => (
                    <span key={c} className="rounded bg-muted px-2 py-1">{c}</span>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {!enabled && !setup && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Scan a QR code with Google Authenticator, Authy or 1Password, then verify a code.
              </p>
              <Button
                variant="gradient"
                className="group shrink-0"
                onClick={() => setupM.mutate()}
                disabled={setupM.isPending}
                data-testid={tid("setup-btn")}
              >
                <Icon name="lock" size={15} className="text-white" />
                {setupM.isPending ? "Starting…" : "Set up 2FA"}
              </Button>
            </div>
          )}

          {setup && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={setup.qr_data_url}
                  alt="2FA QR code"
                  className="size-40 rounded-lg border border-border bg-white p-2"
                  data-testid={tid("qr")}
                />
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Scan this with your authenticator app, then enter the 6-digit code it shows.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor={tid("code")}>Verification code</Label>
                    <Input
                      id={tid("code")}
                      inputMode="numeric"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="123456"
                      className="font-mono tracking-[0.3em]"
                      data-testid={tid("code-input")}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setSetup(null); setCode(""); }} data-testid={tid("cancel-btn")}>
                  Cancel
                </Button>
                <Button
                  variant="gradient"
                  onClick={() => enableM.mutate()}
                  disabled={enableM.isPending || code.trim().length < 6}
                  data-testid={tid("enable-btn")}
                >
                  {enableM.isPending ? "Verifying…" : "Verify & enable"}
                </Button>
              </div>
            </div>
          )}

          {enabled && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                2FA is active. {statusQ.data?.backup_codes_remaining ?? 0} backup codes remaining.
                Enter a current code to turn it off.
              </p>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor={tid("disable-code")}>Authenticator or backup code</Label>
                  <Input
                    id={tid("disable-code")}
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value)}
                    placeholder="123456"
                    className="font-mono"
                    data-testid={tid("disable-code-input")}
                  />
                </div>
                <Button
                  variant="destructive"
                  onClick={() => disableM.mutate()}
                  disabled={disableM.isPending || disableCode.trim().length < 6}
                  data-testid={tid("disable-btn")}
                >
                  {disableM.isPending ? "Disabling…" : "Disable 2FA"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          When 2FA is on, sign-in asks for a code after your password.
        </CardFooter>
      </QueryBoundary>
    </Card>
  );
}
