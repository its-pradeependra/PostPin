import Link from "next/link";
import type { Metadata } from "next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: `Privacy Policy — ${site.name}`,
  description:
    "How Postpin collects, uses, processes and protects your data — including our DPA and sub-processors.",
};

const LAST_UPDATED = "26 Jun 2026";
const VERSION = "v1.4";

const TOC = [
  { id: "overview", label: "1. Overview" },
  { id: "data-collected", label: "2. Data we collect" },
  { id: "cookies", label: "3. Cookies & tracking" },
  { id: "processing", label: "4. How we process data" },
  { id: "sharing", label: "5. Sharing & disclosure" },
  { id: "retention", label: "6. Data retention" },
  { id: "security", label: "7. Security" },
  { id: "dpa", label: "8. DPA & sub-processors" },
  { id: "rights", label: "9. Your rights" },
  { id: "contact", label: "10. Contact" },
] as const;

const DATA_COLLECTED = [
  {
    id: "account",
    category: "Account data",
    examples: "Name, work email, company, hashed password, GSTIN",
    purpose: "Authentication, billing, support",
  },
  {
    id: "usage",
    category: "Usage data",
    examples: "API call metadata, endpoints, latency, status codes, IP",
    purpose: "Analytics, abuse prevention, rate limiting",
  },
  {
    id: "request",
    category: "Request payloads",
    examples: "Pincodes, weights, dimensions, payment type (no PII required)",
    purpose: "Computing shipping rates",
  },
  {
    id: "billing",
    category: "Billing data",
    examples: "Plan, invoices, payment tokens (held by our PSP)",
    purpose: "Processing payments",
  },
];

const SUBPROCESSORS = [
  {
    id: "aws",
    name: "Amazon Web Services (AWS)",
    purpose: "Cloud hosting & databases",
    location: "Mumbai (ap-south-1), India",
  },
  {
    id: "razorpay",
    name: "Razorpay",
    purpose: "Payment processing & GST invoicing",
    location: "India",
  },
  {
    id: "resend",
    name: "Resend",
    purpose: "Transactional email delivery",
    location: "United States",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    purpose: "CDN, DDoS protection & DNS",
    location: "Global edge network",
  },
  {
    id: "posthog",
    name: "PostHog (self-hosted)",
    purpose: "Product analytics",
    location: "Mumbai, India",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="container mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
      <div className="mb-10 border-b border-border pb-8">
        <Badge variant="muted" data-testid="legal-eyebrow-badge">
          Legal
        </Badge>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Privacy <span className="text-gradient">Policy</span>
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          This policy explains what data {site.name} collects, why we collect it,
          how it is processed and stored, and the rights you have over it.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p
            className="text-sm text-muted-foreground"
            data-testid="legal-last-updated"
          >
            <span className="font-medium text-foreground">Last updated</span>{" "}
            {LAST_UPDATED}
            <span className="mx-2 text-border">·</span>
            <span className="font-mono tabular-nums">{VERSION}</span>
          </p>
          <div
            className="flex items-center gap-1 rounded-lg border border-border p-1"
            data-testid="legal-doc-switcher"
          >
            <Button
              asChild
              variant="ghost"
              size="sm"
              data-testid="legal-switch-terms-btn"
            >
              <Link href="/legal/terms">Terms</Link>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="pointer-events-none"
              data-testid="legal-switch-privacy-btn"
            >
              Privacy
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-12">
        {/* Table of contents */}
        <aside className="lg:sticky lg:top-24 lg:self-start" data-testid="legal-toc">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            On this page
          </p>
          <nav className="flex flex-col gap-1">
            {TOC.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="group rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                data-testid={`legal-toc-link-${item.id}`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Document body */}
        <article className="max-w-3xl space-y-10 text-sm leading-7 text-muted-foreground [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h3]:font-display [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline">
          <section
            id="overview"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-overview"
          >
            <h2>1. Overview</h2>
            <p>
              {site.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is an India-first
              shipping rate API. We are committed to collecting the minimum data
              needed to run the Service and to keeping it secure. This policy
              applies to our marketing site, dashboard and API. It should be read
              alongside our <Link href="/legal/terms">Terms of Service</Link>.
            </p>
            <p>
              We act as a <span className="font-medium text-foreground">data controller</span>{" "}
              for your account data, and as a{" "}
              <span className="font-medium text-foreground">data processor</span>{" "}
              for the request payloads you send through the API on behalf of your
              own customers.
            </p>
          </section>

          <section
            id="data-collected"
            className="scroll-mt-24 space-y-4"
            data-testid="legal-section-data-collected"
          >
            <h2>2. Data we collect</h2>
            <p>
              We collect only what we need to provide and improve the Service.
              Notably, the rate API is designed to work without end-customer
              personal data — pincodes and parcel dimensions are sufficient.
            </p>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table data-testid="legal-data-collected-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Examples</TableHead>
                    <TableHead>Purpose</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DATA_COLLECTED.map((row) => (
                    <TableRow
                      key={row.id}
                      data-testid={`legal-data-row-${row.id}`}
                    >
                      <TableCell className="font-medium text-foreground">
                        {row.category}
                      </TableCell>
                      <TableCell>{row.examples}</TableCell>
                      <TableCell>{row.purpose}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section
            id="cookies"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-cookies"
          >
            <h2>3. Cookies &amp; tracking</h2>
            <p>
              We use a small set of cookies. Strictly necessary cookies keep you
              signed in (a JWT session cookie) and remember your theme preference.
              We use privacy-friendly, self-hosted product analytics to understand
              dashboard usage in aggregate.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="font-medium text-foreground">Essential:</span>{" "}
                session, CSRF and theme cookies — cannot be disabled.
              </li>
              <li>
                <span className="font-medium text-foreground">Analytics:</span>{" "}
                anonymised usage events; you can opt out in your account settings.
              </li>
              <li>We do not sell your data or use third-party advertising trackers.</li>
            </ul>
          </section>

          <section
            id="processing"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-processing"
          >
            <h2>4. How we process data</h2>
            <p>
              We process personal data on the following legal bases: performance
              of our contract with you, our legitimate interests in operating and
              securing the Service, your consent (for optional analytics), and
              compliance with legal obligations (such as GST record-keeping).
            </p>
            <p>
              API request payloads are processed in-memory to compute a rate and
              are logged in metadata form (pincodes, weight, zone, latency) for
              analytics and debugging. We do not require or store end-customer
              names, addresses or phone numbers.
            </p>
          </section>

          <section
            id="sharing"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-sharing"
          >
            <h2>5. Sharing &amp; disclosure</h2>
            <p>
              We share data only with the sub-processors listed below, and only
              as needed to run the Service. We may disclose data if required by
              law or to protect the rights, safety and integrity of {site.name},
              our users or the public. In the event of a merger or acquisition,
              data may transfer subject to this policy.
            </p>
          </section>

          <section
            id="retention"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-retention"
          >
            <h2>6. Data retention</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="font-medium text-foreground">Account data:</span>{" "}
                kept while your account is active and deleted within 30 days of
                account closure.
              </li>
              <li>
                <span className="font-medium text-foreground">Usage logs:</span>{" "}
                retained for 13 months, then aggregated and anonymised.
              </li>
              <li>
                <span className="font-medium text-foreground">Billing &amp; GST records:</span>{" "}
                retained for 8 years as required by Indian tax law.
              </li>
            </ul>
          </section>

          <section
            id="security"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-security"
          >
            <h2>7. Security</h2>
            <p>
              Data is encrypted in transit (TLS 1.2+) and at rest (AES-256).
              Passwords are hashed with a modern algorithm; API keys are stored as
              salted hashes and shown in full only once. We enforce least-privilege
              access, audit logging and regular backups. No method of transmission
              is 100% secure, but we work hard to protect your data.
            </p>
          </section>

          <section
            id="dpa"
            className="scroll-mt-24 space-y-4"
            data-testid="legal-section-dpa"
          >
            <h2>8. DPA &amp; sub-processors</h2>
            <p>
              For customers who require one, we offer a{" "}
              <span className="font-medium text-foreground">Data Processing Addendum (DPA)</span>{" "}
              that governs our processing of personal data on your behalf. To
              request a signed DPA, email{" "}
              <a href={`mailto:${site.email}`}>{site.email}</a>. We engage the
              following sub-processors:
            </p>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table data-testid="legal-dpa-subprocessors">
                <TableHeader>
                  <TableRow>
                    <TableHead>Sub-processor</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SUBPROCESSORS.map((sp) => (
                    <TableRow
                      key={sp.id}
                      data-testid={`legal-subprocessor-row-${sp.id}`}
                    >
                      <TableCell className="font-medium text-foreground">
                        {sp.name}
                      </TableCell>
                      <TableCell>{sp.purpose}</TableCell>
                      <TableCell>{sp.location}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs">
              We notify customers of new sub-processors at least 30 days before
              they begin processing, giving you an opportunity to object.
            </p>
          </section>

          <section
            id="rights"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-rights"
          >
            <h2>9. Your rights</h2>
            <p>
              Subject to applicable law (including India&rsquo;s DPDP Act), you have
              the right to access, correct, export and delete your personal data,
              to withdraw consent for optional processing, and to lodge a
              complaint. Most of these actions are self-service from your account
              settings; for the rest, contact us and we will respond within 30
              days.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Access &amp; portability — export your account and usage data.</li>
              <li>Rectification — update inaccurate account details.</li>
              <li>Erasure — request deletion of your account and associated data.</li>
              <li>Objection — opt out of optional analytics processing.</li>
            </ul>
          </section>

          <section
            id="contact"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-contact"
          >
            <h2>10. Contact</h2>
            <p>
              For privacy questions, data requests or to reach our Data Protection
              Officer, email{" "}
              <a href={`mailto:${site.email}`}>{site.email}</a> or write to us via
              our <Link href="/contact">contact page</Link>. We are based in
              Jaipur, Rajasthan, India.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild variant="gradient" className="group" data-testid="legal-contact-btn">
                <Link href="/contact">
                  <Icon name="mail" trigger="group-hover" size={16} className="text-white" />
                  Contact privacy team
                </Link>
              </Button>
              <Button asChild variant="outline" className="group" data-testid="legal-terms-link-btn">
                <Link href="/legal/terms">
                  Read the Terms of Service
                  <Icon name="arrowRight" trigger="group-hover" size={16} />
                </Link>
              </Button>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}
