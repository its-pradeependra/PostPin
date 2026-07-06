import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Icon, type IconName } from "@/components/icons";
import { CopyButton } from "@/components/shared/copy-button";
import { site } from "@/lib/site";
import { pageMetadata } from "@/lib/seo";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = pageMetadata({
  title: "Contact Sales — Volume Pricing & Custom Rate Cards",
  description:
    "Talk to the Postpin team about volume pricing, custom rate cards, security reviews and support. We reply within one business day.",
  path: "/contact",
  keywords: ["shipping API pricing enquiry", "contact shipping API provider"],
});

const CHANNELS: {
  id: string;
  icon: IconName;
  label: string;
  value: string;
  href: string;
}[] = [
  {
    id: "sales",
    icon: "dollar",
    label: "Sales & volume pricing",
    value: site.email,
    href: `mailto:${site.email}`,
  },
  {
    id: "support",
    icon: "headphones",
    label: "Product support",
    value: site.supportEmail,
    href: `mailto:${site.supportEmail}`,
  },
];

const WHY: { id: string; icon: IconName; title: string; body: string }[] = [
  {
    id: "accuracy",
    icon: "verified",
    title: "Quote = invoice",
    body: "GST-aware, zone-accurate charges so the rate you show at checkout is the rate the courier bills.",
  },
  {
    id: "india",
    icon: "sync",
    title: "India Post auto-sync",
    body: "Your pincode master stays current with India Post — no monthly data-ops scramble.",
  },
  {
    id: "speed",
    icon: "zap",
    title: "Sub-50ms responses",
    body: "One REST call returns an itemised rate fast enough to sit on the critical path of checkout.",
  },
];

export default function ContactPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-40" />
        <div className="pointer-events-none absolute -top-32 right-1/3 -z-10 size-[34rem] rounded-full bg-brand-gradient opacity-20 blur-[130px]" />
        <div className="mx-auto max-w-6xl px-4 pt-16 pb-6 sm:px-6 lg:pt-20">
          <Badge
            variant="outline"
            className="gap-1.5 border-primary/30 bg-primary/5 py-1 text-primary"
            data-testid="contact-eyebrow-badge"
          >
            <Icon name="message" size={13} />
            Contact &amp; sales
          </Badge>
          <h1 className="mt-5 max-w-2xl font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
            Let&apos;s talk shipping{" "}
            <span className="text-gradient">at scale</span>.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">
            Volume pricing, custom rate cards, security reviews or just a question
            about the API — tell us what you&apos;re building and we&apos;ll get you
            the right answer fast.
          </p>
        </div>
      </section>

      {/* ── Form + info ── */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
          {/* Left — form */}
          <Card className="order-2 lg:order-1" data-testid="contact-form-card">
            <CardHeader>
              <CardTitle className="font-display text-xl">Send us a message</CardTitle>
              <CardDescription>
                Fill this in and the right person on our team will reply within one
                business day.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ContactForm />
            </CardContent>
          </Card>

          {/* Right — info column */}
          <div className="order-1 space-y-5 lg:order-2 lg:sticky lg:top-24">
            {/* Channels */}
            <Card data-testid="contact-channels-card">
              <CardHeader>
                <CardTitle className="font-display text-lg">Reach us directly</CardTitle>
                <CardDescription>
                  Prefer email? These reach the right inbox.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {CHANNELS.map((c) => (
                  <div
                    key={c.id}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-accent/40 p-3"
                    data-testid={`contact-channel-${c.id}`}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-gradient-soft text-primary">
                      <Icon name={c.icon} size={17} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">{c.label}</p>
                      <a
                        href={c.href}
                        className="block truncate font-mono text-sm text-foreground hover:text-primary"
                        data-testid={`contact-channel-link-${c.id}`}
                      >
                        {c.value}
                      </a>
                    </div>
                    <CopyButton
                      value={c.value}
                      label="Copy"
                      testId={`contact-channel-copy-${c.id}`}
                    />
                  </div>
                ))}

                <Separator />

                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/12 text-success">
                    <Icon name="clock" size={17} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Replies within 1 business day
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Mon–Fri, 10:00–19:00 IST. Enterprise plans get a named contact.
                    </p>
                  </div>
                </div>

                <Button
                  asChild
                  variant="outline"
                  className="group w-full"
                  data-testid="contact-status-link-btn"
                >
                  <Link href="/status">
                    <Icon name="activity" size={16} />
                    Check system status
                  </Link>
                </Button>
              </CardContent>
            </Card>

            {/* Office / region */}
            <Card data-testid="contact-office-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-lg">
                  <Icon name="pin" size={18} className="text-primary" />
                  Made in India
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <address className="not-italic text-muted-foreground">
                  Postpin Technologies Pvt. Ltd.
                  <br />
                  C-21, Sardar Patel Marg, C-Scheme
                  <br />
                  Jaipur, Rajasthan 302001
                  <br />
                  India
                </address>
                <p className="text-muted-foreground">
                  Built and operated from India 🇮🇳 — INR-native billing, GST
                  invoices and a pincode engine tuned for every corner of the country,
                  from metros to special &amp; remote zones.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="muted">₹ INR-native</Badge>
                  <Badge variant="muted">GST invoices</Badge>
                  <Badge variant="muted">Data hosted in-region</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Why teams choose Postpin */}
            <Card
              className="bg-brand-gradient-soft"
              data-testid="contact-why-card"
            >
              <CardHeader>
                <CardTitle className="font-display text-lg">
                  Why teams choose Postpin
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {WHY.map((w) => (
                  <div
                    key={w.id}
                    className="group flex items-start gap-3"
                    data-testid={`contact-why-${w.id}`}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card text-primary shadow-sm">
                      <Icon name={w.icon} size={16} />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{w.title}</p>
                      <p className="text-xs text-muted-foreground">{w.body}</p>
                    </div>
                  </div>
                ))}
                <Separator />
                <Button
                  asChild
                  variant="ghost"
                  className="group w-full justify-between"
                  data-testid="contact-docs-link-btn"
                >
                  <Link href="/docs">
                    Prefer to dig into the docs?
                    <Icon name="arrowRight" size={16} />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}
