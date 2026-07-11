"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icons";
import { getPublicPincode, type PublicPincodeDetail } from "@/lib/api/services/public";
import { ApiError } from "@/lib/api/errors";

export function PincodeLookupWidget() {
  const [pin, setPin] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<PublicPincodeDetail | null>(null);
  const [notFound, setNotFound] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const valid = /^\d{6}$/.test(pin);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    setNotFound(null);
    setResult(null);
    try {
      setResult(await getPublicPincode(pin));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(pin);
      else setError("Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card data-testid="pincode-lookup-card">
      <CardContent className="space-y-5 p-6">
        <form onSubmit={lookup} className="flex gap-3" noValidate>
          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="Enter a 6-digit pincode, e.g. 302021"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="font-mono text-base"
            aria-label="Pincode"
            data-testid="pincode-lookup-input"
          />
          <Button type="submit" variant="gradient" disabled={!valid || loading} data-testid="pincode-lookup-submit-btn">
            {loading ? <Icon name="sync" size={16} /> : <Icon name="search" size={16} />}
            Check
          </Button>
        </form>

        {error && (
          <p className="text-sm text-destructive" data-testid="pincode-lookup-error">
            {error}
          </p>
        )}

        {notFound && (
          <div className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground" data-testid="pincode-lookup-notfound">
            <strong className="text-foreground">{notFound}</strong> isn&apos;t in the serviceable pincode master.
            Double-check the digits — or browse the{" "}
            <Link href="/pincodes" className="font-medium text-primary hover:underline">
              pincode directory
            </Link>{" "}
            to find nearby serviceable areas.
          </div>
        )}

        {result && (
          <div className="space-y-4" data-testid="pincode-lookup-result">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-2xl font-bold tabular-nums">{result.pincode}</span>
              {result.is_metro && <Badge variant="info">Metro</Badge>}
              {result.is_remote && <Badge variant="warning">Remote area</Badge>}
              {!result.is_metro && !result.is_remote && <Badge variant="muted">Standard lane</Badge>}
            </div>

            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-4 sm:block">
                <dt className="text-muted-foreground">Area / city</dt>
                <dd className="font-medium">{result.city ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4 sm:block">
                <dt className="text-muted-foreground">District</dt>
                <dd className="font-medium">{result.district ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4 sm:block">
                <dt className="text-muted-foreground">State</dt>
                <dd className="font-medium">{result.state ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4 sm:block">
                <dt className="text-muted-foreground">Serviceability</dt>
                <dd className="flex flex-wrap gap-1.5">
                  <Badge variant={result.serviceable.prepaid ? "success" : "destructive"}>
                    Prepaid {result.serviceable.prepaid ? "✓" : "✗"}
                  </Badge>
                  <Badge variant={result.serviceable.cod ? "success" : "destructive"}>
                    COD {result.serviceable.cod ? "✓" : "✗"}
                  </Badge>
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-3 pt-1">
              <Button variant="outline" size="sm" asChild data-testid="pincode-lookup-detail-link">
                <Link href={`/pincode/${result.pincode}`}>
                  Full pincode page <Icon name="arrowRight" size={14} />
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild data-testid="pincode-lookup-rate-link">
                <Link href="/tools/shipping-rate-calculator">Calculate shipping to {result.pincode}</Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
