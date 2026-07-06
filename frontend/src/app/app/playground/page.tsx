"use client";

import * as React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { CodeTabs } from "@/components/shared/code-block";
import { RateCalculator } from "@/components/shipping/rate-calculator";
import { sampleRequestBody } from "@/lib/shipping";
import { site } from "@/lib/site";
import { formatLatency } from "@/lib/format";
import type { RateResult, RateRequest, ServiceLevel } from "@/lib/types";

interface CapturedRequest {
  origin: string;
  destination: string;
  weightGrams: number;
  service: ServiceLevel;
  cod: boolean;
}

/** Build the canonical /v1/rates request body the playground inputs produce. */
function buildRateRequest(req: CapturedRequest): RateRequest {
  return {
    origin: req.origin,
    destination: req.destination,
    weightGrams: req.weightGrams,
    service: req.service,
    cod: req.cod,
    declaredValue: req.cod ? 1499 : undefined,
  };
}

/** A pretty-printed JSON request body for /v1/rates/calculate. */
function buildRequestJson(req: CapturedRequest): string {
  return JSON.stringify(sampleRequestBody(buildRateRequest(req)), null, 2);
}

/** A copy-pasteable cURL command mirroring the live request. */
function buildCurl(req: CapturedRequest): string {
  const body = buildRequestJson(req)
    .split("\n")
    .map((line, i) => (i === 0 ? line : `  ${line}`))
    .join("\n");
  return `curl ${site.apiBase}/rates/calculate \\
  -H "Authorization: Bearer pk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '${body}'`;
}

/** Serialize the engine result the way the API would return it. */
function buildResponseJson(result: RateResult): string {
  return JSON.stringify(
    {
      currency: result.currency,
      serviceable: result.serviceable,
      zone: result.zone,
      zoneLabel: result.zoneLabel,
      service: result.service,
      serviceLabel: result.serviceLabel,
      etaDays: result.etaDays,
      weight: {
        chargeableGrams: result.chargeableWeightGrams,
        volumetricGrams: result.volumetricWeightGrams,
      },
      origin: result.origin,
      destination: result.destination,
      breakdown: result.breakdown,
      total: result.total,
    },
    null,
    2,
  );
}

const EMPTY_REQUEST = `// Run a calculation to see the request body the playground sends.`;
const EMPTY_RESPONSE = `// The serialized RateResult will appear here after you calculate.`;

export default function PlaygroundPage() {
  const [result, setResult] = React.useState<RateResult | null>(null);
  const [request, setRequest] = React.useState<CapturedRequest | null>(null);

  const handleResult = React.useCallback((r: RateResult, req: CapturedRequest) => {
    setResult(r);
    setRequest(req);
  }, []);

  const tabs = React.useMemo(
    () => [
      {
        label: "cURL",
        language: "bash",
        code: request ? buildCurl(request) : `# ${EMPTY_REQUEST.replace("// ", "")}`,
      },
      {
        label: "Request",
        language: "json",
        code: request ? buildRequestJson(request) : EMPTY_REQUEST,
      },
      {
        label: "Response",
        language: "json",
        code: result ? buildResponseJson(result) : EMPTY_RESPONSE,
      },
    ],
    [request, result],
  );

  return (
    <div className="space-y-6" data-testid="playground-page">
      <PageHeader
        eyebrow="Develop"
        title="Playground"
        description="Build a /v1/rates request and see the live response."
      >
        <Button variant="outline" asChild data-testid="playground-docs-btn" className="group">
          <Link href="/docs">
            <Icon name="book" size={16} className="text-primary" />
            Read the docs
          </Link>
        </Button>
      </PageHeader>

      {/* Live calculator */}
      <Card data-testid="playground-calculator-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Icon name="calculator" size={18} className="text-primary" />
              Rate calculator
            </CardTitle>
            <CardDescription>
              Enter an origin and destination pincode, tweak the parcel, and calculate a live quote.
            </CardDescription>
          </div>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            {result?.serviceable && (
              <Badge variant="gradient" data-testid="playground-zone-badge">
                <Icon name="zones" size={12} className="text-white" />
                {result.zoneLabel} · Zone {result.zone}
              </Badge>
            )}
            <span
              data-testid="playground-cache-pill"
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-success/12 px-2.5 py-1 text-[11px] font-medium text-success"
            >
              <Icon name="zap" size={12} className="text-success" />
              served from cache
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <RateCalculator onResult={handleResult} />
        </CardContent>
      </Card>

      {/* Request / Response as code */}
      <Card data-testid="playground-code-card">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Icon name="code" size={18} className="text-primary" />
              Request &amp; Response
            </CardTitle>
            <CardDescription>
              The exact <code className="font-mono text-xs text-foreground">POST /v1/rates/calculate</code>{" "}
              request your inputs produce, and the live response.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {result?.serviceable && (
              <Badge variant="gradient" data-testid="playground-zone-badge-code">
                <Icon name="zones" size={12} className="text-white" />
                {result.zoneLabel} · Zone {result.zone}
              </Badge>
            )}
            {result && (
              <span
                data-testid="playground-latency-pill"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-accent px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-muted-foreground"
              >
                <Icon name="clock" size={12} className="text-primary" />
                computed in {formatLatency(11)}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <CodeTabs tabs={tabs} testId="playground-code-tabs" />
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon name="help" size={13} className="text-muted-foreground" />
            Want the Node and Python snippets, error envelopes, and auth details? See the{" "}
            <Link
              href="/docs"
              data-testid="playground-docs-link"
              className="group inline-flex items-center gap-0.5 font-medium text-primary underline-offset-4 hover:underline"
            >
              API reference
              <Icon name="arrowRight" size={12} className="text-primary" />
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
