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
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description:
    "The terms governing your use of the Postpin shipping rate API and platform, including the SLA.",
  path: "/legal/terms",
});

const LAST_UPDATED = "26 Jun 2026";
const VERSION = "v1.4";

const TOC = [
  { id: "acceptance", label: "1. Acceptance of terms" },
  { id: "accounts", label: "2. Accounts & eligibility" },
  { id: "api-usage", label: "3. API usage & rate limits" },
  { id: "fees", label: "4. Fees, billing & taxes" },
  { id: "pincode-data", label: "5. Pincode & rate data" },
  { id: "acceptable-use", label: "6. Acceptable use" },
  { id: "sla", label: "7. Service level (SLA)" },
  { id: "ip", label: "8. Intellectual property" },
  { id: "liability", label: "9. Warranties & liability" },
  { id: "termination", label: "10. Termination" },
  { id: "changes", label: "11. Changes & contact" },
] as const;

const SLA_CREDITS = [
  { uptime: "≥ 99.9%", credit: "No credit", tone: "muted" as const },
  { uptime: "99.0% – 99.9%", credit: "10% of monthly fee", tone: "info" as const },
  { uptime: "95.0% – 99.0%", credit: "25% of monthly fee", tone: "warning" as const },
  { uptime: "< 95.0%", credit: "50% of monthly fee", tone: "destructive" as const },
];

export default function TermsOfServicePage() {
  return (
    <main className="container mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
      <div className="mb-10 border-b border-border pb-8">
        <Badge variant="muted" data-testid="legal-eyebrow-badge">
          Legal
        </Badge>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Terms of <span className="text-gradient">Service</span>
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          These terms govern your access to and use of the {site.name} shipping
          rate API, dashboard and related services. Please read them carefully.
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
              variant="secondary"
              size="sm"
              className="pointer-events-none"
              data-testid="legal-switch-terms-btn"
            >
              Terms
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              data-testid="legal-switch-privacy-btn"
            >
              <Link href="/legal/privacy">Privacy</Link>
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
            id="acceptance"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-acceptance"
          >
            <h2>1. Acceptance of terms</h2>
            <p>
              By creating a {site.name} account, generating an API key, or
              otherwise accessing the Service, you agree to be bound by these
              Terms of Service (the &ldquo;Terms&rdquo;) and our{" "}
              <Link href="/legal/privacy">Privacy Policy</Link>. If you are
              entering into these Terms on behalf of a company or other legal
              entity, you represent that you have authority to bind that entity,
              in which case &ldquo;you&rdquo; refers to that entity.
            </p>
            <p>
              If you do not agree to these Terms, you may not use the Service.
              These Terms are governed by the laws of India, with exclusive
              jurisdiction in the courts of Jaipur, Rajasthan.
            </p>
          </section>

          <section
            id="accounts"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-accounts"
          >
            <h2>2. Accounts &amp; eligibility</h2>
            <p>
              You must be at least 18 years old and capable of forming a binding
              contract to use {site.name}. You are responsible for safeguarding
              your account credentials and API keys, and for all activity that
              occurs under them.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Keep your API keys confidential — treat live keys
                (<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">pk_live_…</code>)
                like passwords and never embed them in client-side code.
              </li>
              <li>
                Notify us promptly at{" "}
                <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>{" "}
                if you suspect unauthorized use of your account.
              </li>
              <li>
                One person or entity may not maintain multiple free-tier
                accounts to circumvent usage limits.
              </li>
            </ul>
          </section>

          <section
            id="api-usage"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-api-usage"
          >
            <h2>3. API usage &amp; rate limits</h2>
            <p>
              Your plan determines your monthly call allotment and per-minute
              rate limit (RPM). Requests exceeding your plan&rsquo;s rate limit
              receive an HTTP <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">429</code>{" "}
              response with a <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">Retry-After</code>{" "}
              header. Calls beyond your monthly allotment are blocked until your
              quota resets or you upgrade — they are never billed as extra usage.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Do not attempt to bypass, probe or circumvent rate limits or key restrictions.</li>
              <li>
                Caching of rate responses is permitted for up to 24 hours; pincode
                serviceability data may change with each nightly India Post sync.
              </li>
              <li>
                Automated scraping of the entire pincode master through the rate
                endpoint is prohibited.
              </li>
            </ul>
          </section>

          <section
            id="fees"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-fees"
          >
            <h2>4. Fees, billing &amp; taxes</h2>
            <p>
              Paid plans are billed in advance on a monthly or annual basis in
              Indian Rupees (INR). All fees are exclusive of applicable taxes;
              18% GST is added to every invoice where required by Indian law. A
              valid GSTIN can be added in your billing settings for input tax
              credit.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Fees are non-refundable except where required by law or by the SLA credit terms below.</li>
              <li>There are no usage-based overage charges; calls beyond your plan&rsquo;s allotment are blocked, not billed.</li>
              <li>
                We may suspend the Service for accounts with payments more than 14
                days overdue, after written notice.
              </li>
            </ul>
          </section>

          <section
            id="pincode-data"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-pincode-data"
          >
            <h2>5. Pincode &amp; rate data</h2>
            <p>
              {site.name} synchronises its pincode master with the publicly
              available India Post directory and computes shipping charges using
              our configurable zone and rate-card engine. Rates are estimates
              intended for checkout and quoting; the actual amount charged by a
              carrier may differ.
            </p>
            <p>
              You are responsible for the rate cards, zones and parameters you
              configure. {site.name} does not guarantee that any quoted rate
              matches a third-party carrier&rsquo;s final invoice, and is not a
              party to your shipping contracts.
            </p>
          </section>

          <section
            id="acceptable-use"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-acceptable-use"
          >
            <h2>6. Acceptable use</h2>
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Violate any law, regulation or third-party right.</li>
              <li>Resell, sublicense or white-label the raw rate API without a written reseller agreement.</li>
              <li>Transmit malware, conduct denial-of-service attacks, or interfere with the integrity of the Service.</li>
              <li>Reverse engineer the engine, except to the extent permitted by applicable law.</li>
            </ul>
          </section>

          <section
            id="sla"
            className="scroll-mt-24 space-y-4"
            data-testid="legal-section-sla"
          >
            <h2>7. Service level (SLA)</h2>
            <p>
              For Scale and Enterprise plans, {site.name} targets{" "}
              <span className="font-medium text-foreground">99.9% monthly uptime</span>{" "}
              for the <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/v1/rates</code>{" "}
              endpoint, measured outside of scheduled maintenance windows. If we
              fall short in a calendar month, you may request service credits
              against your next invoice as follows:
            </p>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table data-testid="legal-sla-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Monthly uptime</TableHead>
                    <TableHead className="text-right">Service credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SLA_CREDITS.map((row) => (
                    <TableRow
                      key={row.uptime}
                      data-testid={`legal-sla-row-${row.tone}`}
                    >
                      <TableCell className="font-mono tabular-nums text-foreground">
                        {row.uptime}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={row.tone}>{row.credit}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs">
              Credits are capped at 50% of the affected month&rsquo;s fee and must
              be requested within 30 days. Maintenance windows and incident
              history are published on our{" "}
              <Link href="/status">status page</Link>.
            </p>
          </section>

          <section
            id="ip"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-ip"
          >
            <h2>8. Intellectual property</h2>
            <p>
              {site.name}, its logo, the engine and all related software are the
              property of {site.name} and its licensors. We grant you a limited,
              non-exclusive, non-transferable licence to access the Service per
              these Terms. You retain all rights to your configuration data, rate
              cards and the requests you submit.
            </p>
          </section>

          <section
            id="liability"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-liability"
          >
            <h2>9. Warranties &amp; limitation of liability</h2>
            <p>
              The Service is provided &ldquo;as is&rdquo; without warranties of
              any kind, express or implied, except as expressly stated in the SLA.
              To the maximum extent permitted by law, {site.name}&rsquo;s
              aggregate liability arising out of these Terms is limited to the
              fees you paid in the 12 months preceding the claim.
            </p>
            <p>
              {site.name} is not liable for indirect, incidental or consequential
              damages, including lost profits or shipping cost discrepancies
              arising from quoted rates.
            </p>
          </section>

          <section
            id="termination"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-termination"
          >
            <h2>10. Termination</h2>
            <p>
              You may cancel your subscription at any time from your billing
              settings; access continues until the end of the paid period. We may
              suspend or terminate your access for material breach of these Terms,
              non-payment, or activity that threatens the Service. On termination,
              your right to use the API ceases and we may delete your account data
              after a 30-day grace period.
            </p>
          </section>

          <section
            id="changes"
            className="scroll-mt-24 space-y-3"
            data-testid="legal-section-changes"
          >
            <h2>11. Changes &amp; contact</h2>
            <p>
              We may update these Terms from time to time. Material changes will be
              announced by email or an in-dashboard notice at least 14 days before
              they take effect. Continued use after the effective date constitutes
              acceptance.
            </p>
            <p>
              Questions about these Terms? Email{" "}
              <a href={`mailto:${site.email}`}>{site.email}</a> or visit our{" "}
              <Link href="/contact">contact page</Link>.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild variant="gradient" className="group" data-testid="legal-contact-btn">
                <Link href="/contact">
                  <Icon name="mail" size={16} className="text-white" />
                  Contact us
                </Link>
              </Button>
              <Button asChild variant="outline" className="group" data-testid="legal-privacy-link-btn">
                <Link href="/legal/privacy">
                  Read the Privacy Policy
                  <Icon name="arrowRight" size={16} />
                </Link>
              </Button>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}
