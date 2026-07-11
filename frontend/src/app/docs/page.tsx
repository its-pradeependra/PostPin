import Link from "next/link";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CodeBlock, CodeTabs } from "@/components/shared/code-block";
import { CopyButton } from "@/components/shared/copy-button";
import { Icon } from "@/components/icons";
import { DocsSectionTracker } from "@/components/docs/docs-section-tracker";
import { site } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "API Documentation — Shipping Rate API Reference & Quickstart",
  description:
    "Integrate the Postpin shipping calculation API in minutes. Quickstart, authentication, the Rate API, serviceability, pincodes, webhooks, errors and SDKs.",
  path: "/docs",
  keywords: [
    "shipping API documentation",
    "shipping rate API reference",
    "shipping API integration guide",
    "pincode serviceability endpoint",
    "shipping API quickstart",
  ],
});

/* ──────────────────────────────────────────────────────────────────────────
   Static reference data (kept local to the page; mirrors the live engine).
   ────────────────────────────────────────────────────────────────────────── */

const NAV: { id: string; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { id: "quickstart", label: "Quickstart", icon: "rocket" },
  { id: "authentication", label: "Authentication", icon: "lock" },
  { id: "rate-api", label: "Rate API", icon: "calculator" },
  { id: "serviceability", label: "Serviceability", icon: "truck" },
  { id: "pincodes", label: "Pincodes", icon: "pin" },
  { id: "webhooks", label: "Webhooks", icon: "webhook" },
  { id: "errors", label: "Errors", icon: "shield" },
  { id: "sdks", label: "SDKs", icon: "code" },
  { id: "changelog", label: "Changelog", icon: "clock" },
];

const RATE_BODY = `{
  "origin": "302001",
  "destination": "781001",
  "weight": 400,
  "dimensions": { "length": 30, "width": 25, "height": 8, "unit": "cm" },
  "service": "surface",
  "cod": true,
  "declared_value": 1499
}`;

const CURL_SNIPPET = `curl ${site.apiBase}/rates/calculate \\
  -H "Authorization: Bearer pp_live_3kQ9xR2pLmZ" \\
  -H "Content-Type: application/json" \\
  -d '${RATE_BODY}'`;

const JS_SNIPPET = `import Postpin from "@postpin/node";

const postpin = new Postpin({ apiKey: process.env.POSTPIN_API_KEY });

const rate = await postpin.rates.calculate({
  origin: "302001",
  destination: "781001",
  weight: 400,
  dimensions: { length: 30, width: 25, height: 8, unit: "cm" },
  service: "surface",
  cod: true,
  declared_value: 1499,
});

console.log(rate.total, rate.zone); // 307.58 "special"`;

const PYTHON_SNIPPET = `import os
from postpin import Postpin

postpin = Postpin(api_key=os.environ["POSTPIN_API_KEY"])

rate = postpin.rates.calculate(
    origin="302001",
    destination="781001",
    weight=400,
    dimensions={"length": 30, "width": 25, "height": 8, "unit": "cm"},
    service="surface",
    cod=True,
    declared_value=1499,
)

print(rate.total, rate.zone)  # 307.58 "special"`;

const RATE_RESPONSE = `{
  "currency": "INR",
  "zone": "special",
  "zone_label": "Special / Remote",
  "service": "surface",
  "chargeable_weight_g": 1200,
  "volumetric_weight_g": 1200,
  "eta_days": [5, 9],
  "breakdown": [
    { "label": "Base charge",    "amount": 95.00, "hint": "Special / Remote · Surface" },
    { "label": "Weight charge",  "amount": 108.00, "hint": "1.50 kg chargeable" },
    { "label": "Fuel surcharge", "amount": 24.36, "hint": "12%" },
    { "label": "COD handling",   "amount": 57.49, "hint": "₹35 + 1.5%" },
    { "label": "GST",            "amount": 51.27, "hint": "18%" }
  ],
  "total": 336.12,
  "origin":      { "pincode": "302001", "city": "Jaipur",   "state": "Rajasthan" },
  "destination": { "pincode": "781001", "city": "Guwahati", "state": "Assam" },
  "serviceable": true,
  "meta": { "engine_ms": 11, "cached": false, "request_id": "req_7Yh2mKp" }
}`;

const SERVICEABILITY_CURL = `curl ${site.apiBase}/serviceability/781001 \\
  -H "Authorization: Bearer pp_live_3kQ9xR2pLmZ"`;

const SERVICEABILITY_RESPONSE = `{
  "data": {
    "pincode": "781001",
    "serviceable": true,
    "found": true,
    "city": "Guwahati",
    "state": "Assam"
  },
  "meta": { "request_id": "req_7Yh2mKp", "api_version": "v1" }
}`;

const PINCODES_CURL = `curl "${site.apiBase}/pincodes?q=jaipur&limit=5" \\
  -H "Authorization: Bearer pp_live_3kQ9xR2pLmZ"`;

const PINCODES_RESPONSE = `{
  "data": [
    { "pincode": "302001", "city": "Jaipur", "state": "Rajasthan", "metro": false, "serviceable": true },
    { "pincode": "302002", "city": "Jaipur", "state": "Rajasthan", "metro": false, "serviceable": true }
  ],
  "meta": { "request_id": "req_9Kd4nQw", "api_version": "v1", "has_more": false }
}`;

const WEBHOOK_PAYLOAD = `POST /your-endpoint  HTTP/1.1
Postpin-Signature: t=1718900000,v1=5257a869e7ec...
Content-Type: application/json

{
  "id": "evt_2nKp7Yh",
  "type": "rate.calculated",
  "created": 1718900000,
  "livemode": true,
  "data": {
    "request_id": "req_7Yh2mKp",
    "origin": "302001",
    "destination": "781001",
    "zone": "special",
    "total": 336.12,
    "currency": "INR"
  }
}`;

const WEBHOOK_VERIFY = `import crypto from "node:crypto";

function verify(rawBody, header, secret) {
  const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${t}.\${rawBody}\`)
    .digest("hex");
  // Constant-time compare; reject if t is older than 5 minutes.
  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}`;

type Param = {
  name: string;
  type: string;
  required: boolean;
  desc: string;
};

const RATE_PARAMS: Param[] = [
  { name: "origin", type: "string", required: true, desc: "Pickup pincode (6 digits)." },
  { name: "destination", type: "string", required: true, desc: "Delivery pincode (6 digits)." },
  { name: "weight", type: "integer", required: true, desc: "Actual parcel weight in grams." },
  {
    name: "dimensions",
    type: "object",
    required: false,
    desc: "length, width, height (in cm). Used for volumetric weight = L×W×H/5000.",
  },
  {
    name: "service",
    type: "enum",
    required: false,
    desc: "surface (default), air, express, or same_day.",
  },
  {
    name: "cod",
    type: "boolean",
    required: false,
    desc: "Set true for cash-on-delivery to add COD handling.",
  },
  {
    name: "declared_value",
    type: "integer",
    required: false,
    desc: "Declared parcel value in INR. Drives the 1.5% COD fee.",
  },
];

type Field = { name: string; type: string; desc: string };

const RESPONSE_FIELDS: Field[] = [
  { name: "currency", type: "string", desc: "Always INR." },
  { name: "zone", type: "string", desc: "local · regional · metro · national · special." },
  { name: "chargeable_weight_g", type: "integer", desc: "max(actual, volumetric) in grams." },
  { name: "volumetric_weight_g", type: "integer", desc: "Volumetric weight in grams." },
  { name: "eta_days", type: "[int, int]", desc: "Estimated delivery window, low–high." },
  { name: "breakdown", type: "array", desc: "Itemised charge lines (label, amount, hint)." },
  { name: "total", type: "number", desc: "Grand total in INR, GST inclusive." },
  { name: "serviceable", type: "boolean", desc: "False when a pincode is unknown or off-network." },
];

type EventRow = { event: string; desc: string };

const WEBHOOK_EVENTS: EventRow[] = [
  { event: "rate.calculated", desc: "A rate was successfully computed via the API." },
  { event: "serviceability.checked", desc: "A serviceability lookup was performed." },
  { event: "sync.completed", desc: "Nightly India Post pincode sync finished." },
  { event: "sync.failed", desc: "A pincode sync run failed and needs attention." },
  { event: "subscription.updated", desc: "Plan, status or limits changed for the tenant." },
  { event: "invoice.paid", desc: "A usage / subscription invoice was paid." },
];

type ErrorRow = { status: string; code: string; meaning: string };

const ERROR_CODES: ErrorRow[] = [
  { status: "400", code: "invalid_request", meaning: "A required field is missing or malformed." },
  { status: "401", code: "authentication_failed", meaning: "Missing, revoked or invalid API key." },
  { status: "403", code: "domain_not_allowed", meaning: "Request origin is not in the key's allow-list." },
  { status: "404", code: "pincode_not_found", meaning: "Pincode is unknown to the master." },
  { status: "422", code: "not_serviceable", meaning: "Route exists but is not currently serviceable." },
  { status: "429", code: "rate_limited", meaning: "Plan RPM exceeded. Inspect Retry-After." },
  { status: "500", code: "engine_error", meaning: "Unexpected error. Safe to retry with backoff." },
];

type SdkRow = { label: string; language: string; code: string };

const SDK_INSTALLS: SdkRow[] = [
  { label: "Node", language: "bash", code: "npm install @postpin/node" },
  { label: "Python", language: "bash", code: "pip install postpin" },
  { label: "PHP", language: "bash", code: "composer require postpin/postpin-php" },
  { label: "Go", language: "bash", code: "go get github.com/postpin/postpin-go" },
];

type ChangeEntry = { version: string; date: string; tone: "gradient" | "info" | "muted"; items: string[] };

const CHANGELOG: ChangeEntry[] = [
  {
    version: "v1.4.0",
    date: "12 Jun 2026",
    tone: "gradient",
    items: [
      "Added GET /v1/serviceability/:pincode for single-call route checks.",
      "Webhook signatures now include a replay-protection timestamp.",
    ],
  },
  {
    version: "v1.3.0",
    date: "28 Apr 2026",
    tone: "info",
    items: [
      "same_day service level is now generally available on metro routes.",
      "Pincode search endpoint added with fuzzy city matching.",
    ],
  },
  {
    version: "v1.2.0",
    date: "03 Mar 2026",
    tone: "muted",
    items: [
      "Per-customer rate cards exposed on Growth and above.",
      "Nightly India Post sync moved to 00:30 IST.",
    ],
  },
];

/* ──────────────────────────────────────────────────────────────────────────
   Small presentational helpers (server-safe).
   ────────────────────────────────────────────────────────────────────────── */

function MethodPill({ method }: { method: "GET" | "POST" }) {
  return (
    <span
      data-testid={`docs-method-${method.toLowerCase()}`}
      className={
        "inline-flex items-center rounded-md px-2 py-1 font-mono text-xs font-semibold " +
        (method === "POST"
          ? "bg-primary/12 text-primary"
          : "bg-info/12 text-info")
      }
    >
      {method}
    </span>
  );
}

function EndpointBar({
  method,
  path,
}: {
  method: "GET" | "POST";
  path: string;
}) {
  const full = `${site.apiBase}${path}`;
  return (
    <div
      data-testid={`docs-endpoint-${path.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3"
    >
      <MethodPill method={method} />
      <code className="flex-1 break-all font-mono text-sm tabular-nums text-foreground">
        {full}
      </code>
      <CopyButton value={full} testId="docs-endpoint-copy-btn" />
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-testid={`docs-section-${id}`}
      className="scroll-mt-24 border-t border-border pt-12 first:border-t-0 first:pt-0"
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">
        {eyebrow}
      </p>
      <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h2>
      {description && (
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      )}
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────────────────── */

export default function DocsPage() {
  return (
    <div className="container mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:py-14">
      <DocsSectionTracker ids={NAV.map((n) => n.id)} />
      {/* Page heading + CTA */}
      <div className="mb-10 flex flex-col gap-5 border-b border-border pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            <Icon name="book" size={14} className="text-primary" />
            API reference · {site.apiBase}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            <span className="text-gradient">Postpin</span> developer docs
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            Get from zero to an accurate INR shipping rate in a single call. REST,
            JSON, India-first — keys, pincodes and zones included.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Button asChild variant="outline" className="group" data-testid="docs-quickstart-btn">
            <Link href="#quickstart">
              <Icon name="rocket" size={16} /> Quickstart
            </Link>
          </Button>
          <Button asChild variant="gradient" className="group" data-testid="docs-getkey-btn">
            <Link href="/signup">
              <Icon name="key" size={16} className="text-white" />
              Get API key
            </Link>
          </Button>
        </div>
      </div>

      {/* Two-column: sticky sidebar + content */}
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
        {/* Sidebar nav (plain anchors) */}
        <aside className="mb-8 lg:mb-0">
          <nav
            data-testid="docs-sidebar-nav"
            aria-label="Documentation"
            className="lg:sticky lg:top-24"
          >
            <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              On this page
            </p>
            <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {NAV.map((item) => (
                <li key={item.id} className="shrink-0">
                  <a
                    href={`#${item.id}`}
                    data-testid={`docs-nav-${item.id}-link`}
                    className="group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Icon
                      name={item.icon}
                      size={16}
                      className="text-primary"
                    />
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>

            <div className="mt-6 hidden rounded-xl border border-border bg-brand-gradient-soft p-4 lg:block">
              <p className="text-sm font-semibold text-foreground">Need a key?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Start free with 1,000 calls / month. No card required.
              </p>
              <Button
                asChild
                variant="gradient"
                size="sm"
                className="group mt-3 w-full"
                data-testid="docs-sidebar-getkey-btn"
              >
                <Link href="/signup">
                  <Icon name="sparkles" size={14} className="text-white" />
                  Get API key
                </Link>
              </Button>
            </div>
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0 space-y-12">
          {/* QUICKSTART */}
          <Section
            id="quickstart"
            eyebrow="Getting started"
            title="Quickstart"
            description="Send your first POST /rates request. Use your test or live key in the Authorization header — the example below prices Jaipur (302001) → Guwahati (781001)."
          >
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                { n: 1, t: "Grab a key", d: "Create a project and copy your pp_live_… key." },
                { n: 2, t: "Send pincodes + parcel", d: "POST origin, destination, weight & dimensions." },
                { n: 3, t: "Receive itemised INR", d: "Get zone, billable weight and a GST breakdown." },
              ].map((s) => (
                <Card key={s.n} data-testid={`docs-quickstart-step-${s.n}`} className="rounded-2xl">
                  <CardContent className="p-5">
                    <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/12 font-mono text-sm font-semibold text-primary">
                      {s.n}
                    </span>
                    <p className="mt-3 text-sm font-semibold text-foreground">{s.t}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{s.d}</p>
                  </CardContent>
                </Card>
              ))}
            </ol>

            <EndpointBar method="POST" path="/rates" />

            <CodeTabs
              testId="docs-quickstart-code-tabs"
              tabs={[
                { label: "cURL", language: "bash", code: CURL_SNIPPET },
                { label: "JavaScript", language: "javascript", code: JS_SNIPPET },
                { label: "Python", language: "python", code: PYTHON_SNIPPET },
              ]}
            />
          </Section>

          {/* AUTHENTICATION */}
          <Section
            id="authentication"
            eyebrow="Security"
            title="Authentication"
            description="Postpin uses bearer API keys. Pass your key in the Authorization header on every request. Keep live keys server-side only."
          >
            <CodeBlock
              testId="docs-auth-code"
              language="bash"
              filename="Authorization header"
              code={`Authorization: Bearer pp_live_3kQ9xR2pLmZ`}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="rounded-2xl">
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-center gap-2">
                    <Icon name="key" size={16} className="text-primary" />
                    <p className="text-sm font-semibold text-foreground">Key types</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <code className="font-mono text-foreground">pp_test_…</code> runs against the
                    sandbox.{" "}
                    <code className="font-mono text-foreground">pp_live_…</code> bills real usage.
                    Rotate keys anytime from the dashboard.
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-center gap-2">
                    <Icon name="globe" size={16} className="text-primary" />
                    <p className="text-sm font-semibold text-foreground">Allowed domains</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Restrict each key to specific domains or IPs. Requests from elsewhere return{" "}
                    <code className="font-mono text-destructive">403 domain_not_allowed</code>.
                  </p>
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* RATE API */}
          <Section
            id="rate-api"
            eyebrow="Core"
            title="Rate API"
            description="Calculate an itemised shipping charge between two Indian pincodes. Returns the zone, billable weight (max of actual & volumetric) and a GST-inclusive breakdown."
          >
            <EndpointBar method="POST" path="/rates" />

            <div>
              <h3 className="mb-3 text-sm font-semibold text-foreground">Request parameters</h3>
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table data-testid="docs-rate-params-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parameter</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Required</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {RATE_PARAMS.map((p) => (
                      <TableRow key={p.name} data-testid={`docs-param-row-${p.name}`}>
                        <TableCell className="font-mono text-xs text-foreground">{p.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {p.type}
                        </TableCell>
                        <TableCell>
                          {p.required ? (
                            <Badge variant="warning">Required</Badge>
                          ) : (
                            <Badge variant="muted">Optional</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.desc}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Example request body</h3>
                <CodeBlock testId="docs-rate-request" language="json" filename="POST /v1/rates" code={RATE_BODY} />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Example response</h3>
                <CodeBlock testId="docs-rate-response" language="json" filename="200 OK" code={RATE_RESPONSE} />
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-foreground">Response schema</h3>
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table data-testid="docs-rate-response-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {RESPONSE_FIELDS.map((f) => (
                      <TableRow key={f.name} data-testid={`docs-field-row-${f.name}`}>
                        <TableCell className="font-mono text-xs text-foreground">{f.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {f.type}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{f.desc}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </Section>

          {/* SERVICEABILITY */}
          <Section
            id="serviceability"
            eyebrow="Core"
            title="Serviceability"
            description="Check whether a single pincode is on-network before you quote. Returns city, state, zone, COD availability and an ETA window."
          >
            <EndpointBar method="GET" path="/serviceability/:pincode" />
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Request</h3>
                <CodeBlock
                  testId="docs-serviceability-request"
                  language="bash"
                  code={SERVICEABILITY_CURL}
                />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Response</h3>
                <CodeBlock
                  testId="docs-serviceability-response"
                  language="json"
                  filename="200 OK"
                  code={SERVICEABILITY_RESPONSE}
                />
              </div>
            </div>
          </Section>

          {/* PINCODES */}
          <Section
            id="pincodes"
            eyebrow="Reference"
            title="Pincodes"
            description="Search the India Post-synced pincode master by code or city. The master refreshes nightly at 00:30 IST; synced_at tells you the last refresh."
          >
            <EndpointBar method="GET" path="/pincodes" />
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Request</h3>
                <CodeBlock testId="docs-pincodes-request" language="bash" code={PINCODES_CURL} />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Response</h3>
                <CodeBlock
                  testId="docs-pincodes-response"
                  language="json"
                  filename="200 OK"
                  code={PINCODES_RESPONSE}
                />
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/12 px-4 py-3 text-sm text-foreground">
              <Icon name="database" size={18} className="mt-0.5 shrink-0 text-info" />
              <p>
                Results are paginated with <code className="font-mono">limit</code> (max 100) and a{" "}
                <code className="font-mono">starting_after</code> cursor. The full master covers
                19,000+ serviceable pincodes.
              </p>
            </div>
          </Section>

          {/* WEBHOOKS */}
          <Section
            id="webhooks"
            eyebrow="Reference"
            title="Webhooks"
            description="Subscribe to events and Postpin will POST a signed JSON payload to your endpoint. Always verify the Postpin-Signature header before trusting a payload."
          >
            <div>
              <h3 className="mb-3 text-sm font-semibold text-foreground">Event types</h3>
              <div className="overflow-x-auto rounded-xl border border-border">
                <Table data-testid="docs-webhook-events-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Triggered when</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {WEBHOOK_EVENTS.map((e) => (
                      <TableRow key={e.event} data-testid={`docs-event-row-${e.event}`}>
                        <TableCell>
                          <code className="font-mono text-xs text-primary">{e.event}</code>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{e.desc}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Signed payload</h3>
                <CodeBlock
                  testId="docs-webhook-payload"
                  language="http"
                  filename="rate.calculated"
                  code={WEBHOOK_PAYLOAD}
                />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Verify the signature</h3>
                <CodeBlock
                  testId="docs-webhook-verify"
                  language="javascript"
                  filename="verify.js"
                  code={WEBHOOK_VERIFY}
                />
              </div>
            </div>
          </Section>

          {/* ERRORS */}
          <Section
            id="errors"
            eyebrow="Reference"
            title="Errors"
            description="Postpin uses conventional HTTP status codes and a stable error envelope: { error: { code, message, request_id } }. Quote the request_id when contacting support."
          >
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table data-testid="docs-errors-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Meaning</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ERROR_CODES.map((e) => (
                    <TableRow key={e.code} data-testid={`docs-error-row-${e.code}`}>
                      <TableCell>
                        <Badge
                          variant={
                            e.status.startsWith("2")
                              ? "success"
                              : e.status.startsWith("4")
                                ? "warning"
                                : "destructive"
                          }
                          className="font-mono"
                        >
                          {e.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <code className="font-mono text-xs text-foreground">{e.code}</code>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.meaning}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <CodeBlock
              testId="docs-error-envelope"
              language="json"
              filename="429 Too Many Requests"
              code={`{
  "error": {
    "code": "rate_limited",
    "message": "Plan limit of 300 requests/min exceeded.",
    "request_id": "req_7Yh2mKp"
  }
}`}
            />
          </Section>

          {/* SDKs */}
          <Section
            id="sdks"
            eyebrow="Tooling"
            title="SDKs"
            description="Official, typed SDKs wrap authentication, retries and idempotency. Install your language and you're a few lines from a rate."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {SDK_INSTALLS.map((s) => (
                <div key={s.label} className="space-y-2" data-testid={`docs-sdk-${s.label.toLowerCase()}`}>
                  <div className="flex items-center gap-2">
                    <Icon name="terminal" size={16} className="text-primary" />
                    <p className="text-sm font-semibold text-foreground">{s.label}</p>
                  </div>
                  <CodeBlock
                    testId={`docs-sdk-${s.label.toLowerCase()}-code`}
                    language={s.language}
                    code={s.code}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline" className="group" data-testid="docs-sdk-github-btn">
                <Link href="https://github.com/postpin" target="_blank" rel="noreferrer">
                  <Icon name="github" size={16} /> View on GitHub
                  <Icon name="external" size={14} className="text-muted-foreground" />
                </Link>
              </Button>
            </div>
          </Section>

          {/* CHANGELOG */}
          <Section
            id="changelog"
            eyebrow="Updates"
            title="Changelog"
            description="Every API change, newest first. The /v1 surface is stable; breaking changes ship behind a new version."
          >
            <ol className="space-y-4">
              {CHANGELOG.map((c) => (
                <li key={c.version} data-testid={`docs-changelog-${c.version}`}>
                  <Card className="rounded-2xl">
                    <CardContent className="p-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <Badge variant={c.tone} className="font-mono">
                          {c.version}
                        </Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">{c.date}</span>
                      </div>
                      <ul className="mt-3 space-y-2">
                        {c.items.map((item, idx) => (
                          <li
                            key={`${c.version}-${idx}`}
                            className="flex items-start gap-2 text-sm text-muted-foreground"
                          >
                            <Icon
                              name="checkCircle"
                              size={16}
                              className="mt-0.5 shrink-0 text-success"
                            />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          </Section>

          {/* Bottom CTA */}
          <div className="rounded-2xl border border-border bg-brand-gradient-soft p-6 sm:p-8">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-xl font-bold text-foreground sm:text-2xl">
                  Ready to ship accurate rates?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create a key in seconds — 1,000 free calls every month.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="gradient" className="group" data-testid="docs-cta-getkey-btn">
                  <Link href="/signup">
                    <Icon name="key" size={16} className="text-white" />
                    Get API key
                  </Link>
                </Button>
                <Button asChild variant="outline" className="group" data-testid="docs-cta-contact-btn">
                  <Link href="/contact">
                    <Icon name="headphones" size={16} /> Talk to sales
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
