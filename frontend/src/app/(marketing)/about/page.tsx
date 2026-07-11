import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Icon, type IconName } from "@/components/icons";
import { PincodeCount } from "./pincode-count";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "About Us — The Team Behind the Shipping Rate API",
  description:
    "Postpin is on a mission to make the quoted shipping price equal the invoiced price for every Indian business. Meet the team, our story and our values.",
  path: "/about",
  keywords: ["Postpin team", "shipping API company India", "logistics technology startup India"],
});

/* ── Static content ─────────────────────────────────────────────────────── */

const TRACTION: { value: ReactNode; label: string }[] = [
  { value: <PincodeCount testId="about-stat-pincodes" />, label: "Pincodes synced from India Post" },
  { value: "42M+", label: "Rate calls served" },
  { value: "1,284", label: "Tenants on Postpin" },
  { value: "99.9%", label: "Uptime, last 12 months" },
];

type Milestone = {
  id: string;
  year: string;
  title: ReactNode;
  body: string;
  icon: IconName;
};

const TIMELINE: Milestone[] = [
  {
    id: "founded",
    year: "2023",
    title: "Postpin founded in Jaipur",
    body: "Two ops engineers, tired of reconciling courier rate sheets by hand, set out to build a single neutral shipping-rate API for India.",
    icon: "rocket",
  },
  {
    id: "india-post-sync",
    year: "2024",
    title: "India Post auto-sync goes live",
    body: "A nightly cron began diffing the India Post directory into every tenant's pincode master — no more stale CSVs or manual uploads.",
    icon: "sync",
  },
  {
    id: "pincodes-synced",
    year: "2025",
    title: (
      <>
        <PincodeCount testId="about-timeline-pincodes" /> pincodes in sync
      </>
    ),
    body: "Postpin crossed full national pincode coverage with zone resolution for every serviceable PIN across all states and union territories.",
    icon: "pin",
  },
  {
    id: "v1-ga",
    year: "2026",
    title: "/v1 reaches general availability",
    body: "The rate engine, rate cards, webhooks and usage analytics shipped to GA — now serving 1,284 tenants and 42M+ calls a month.",
    icon: "verified",
  },
];

type Value = {
  id: string;
  title: string;
  body: string;
  icon: IconName;
};

const VALUES: Value[] = [
  {
    id: "accuracy",
    title: "Accuracy over approximation",
    body: "The quoted price must equal the invoiced price. We obsess over zone resolution, volumetric weight and GST so your checkout never lies.",
    icon: "gauge",
  },
  {
    id: "developer-first",
    title: "Developer-first, always",
    body: "Predictable JSON, typed SDKs, honest docs and sub-50ms responses. If it takes more than five minutes to your first quote, we failed.",
    icon: "code",
  },
  {
    id: "india-built",
    title: "Built in India, for India",
    body: "India Post-native pincodes, INR-first billing with GST invoices, and a zone engine modelled on how the country actually ships.",
    icon: "globe",
  },
  {
    id: "trust",
    title: "Trust by default",
    body: "Domain and IP-scoped keys, signed webhooks, audit logs and a 99.9% SLA. Your pricing data and your customers' trust come first.",
    icon: "shieldCheck",
  },
];

type Member = {
  id: string;
  name: string;
  role: string;
  seed: string;
};

const TEAM: Member[] = [
  { id: "tm-aarav", name: "Aarav Sharma", role: "Co-founder & CEO", seed: "AaravSharma" },
  { id: "tm-deepa", name: "Deepa Menon", role: "Co-founder & CTO", seed: "DeepaMenon" },
  { id: "tm-karan", name: "Karan Patel", role: "Head of Engineering", seed: "KaranPatel" },
  { id: "tm-neha", name: "Neha Gupta", role: "Head of Product", seed: "NehaGupta" },
  { id: "tm-vikram", name: "Vikram Singh", role: "Lead, Data & Sync", seed: "VikramSingh" },
  { id: "tm-sana", name: "Sana Khan", role: "Design Lead", seed: "SanaKhan" },
  { id: "tm-arjun", name: "Arjun Rao", role: "Developer Relations", seed: "ArjunRao" },
  { id: "tm-ritu", name: "Ritu Joshi", role: "Head of Customer Success", seed: "RituJoshi" },
];

type Post = {
  id: string;
  category: string;
  title: string;
  excerpt: string;
  date: string;
  readMins: number;
};

const POSTS: Post[] = [
  {
    id: "post-zone-engine",
    category: "Engineering",
    title: "How we model India's shipping zones deterministically",
    excerpt: "A look inside the origin × destination resolution that turns two pincodes into a stable, reproducible zone — every single time.",
    date: "12 Jun 2026",
    readMins: 7,
  },
  {
    id: "post-volumetric",
    category: "Product",
    title: "Volumetric weight, explained for your checkout",
    excerpt: "Why a light, bulky parcel costs more to ship, and how Postpin's billable-weight math keeps your quotes honest at the cart.",
    date: "28 May 2026",
    readMins: 5,
  },
  {
    id: "post-india-post-sync",
    category: "Behind the scenes",
    title: "The nightly cron that keeps 1.5 lakh pincodes fresh",
    excerpt: "Diffing the India Post directory at 00:30 IST — inserts, updates, retirements, rollback and the alerts that catch a bad sync.",
    date: "09 May 2026",
    readMins: 6,
  },
];

type Role = {
  id: string;
  title: string;
  dept: string;
  location: string;
  type: string;
};

const ROLES: Role[] = [
  { id: "role-be", title: "Senior Backend Engineer (Rate Engine)", dept: "Engineering", location: "Jaipur / Remote", type: "Full-time" },
  { id: "role-data", title: "Data Engineer — Pincode & Sync", dept: "Data", location: "Remote, India", type: "Full-time" },
  { id: "role-devrel", title: "Developer Advocate", dept: "Developer Relations", location: "Bengaluru / Remote", type: "Full-time" },
  { id: "role-ae", title: "Account Executive (Mid-Market)", dept: "Sales", location: "Mumbai", type: "Full-time" },
];

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function AboutPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-40" />
        <div className="pointer-events-none absolute -top-40 left-1/3 -z-10 size-[40rem] rounded-full bg-brand-gradient opacity-20 blur-[130px]" />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 lg:py-28">
          <Badge
            variant="outline"
            className="gap-1.5 border-primary/30 bg-primary/5 py-1 text-primary"
            data-testid="about-eyebrow-badge"
          >
            <Icon name="company" size={13} />
            Our story · Built in India
          </Badge>
          <h1 className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            We&apos;re fixing <span className="text-gradient">Indian shipping rates</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Every Indian business deserves a single, neutral way to price a parcel between any two
            pincodes — accurately, in INR, with the quote always matching the invoice. That&apos;s
            the API we&apos;re building.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="gradient" size="lg">
              <Link href="/signup" data-testid="about-hero-signup-btn">
                Start free
                <Icon name="arrowRight" size={17} className="text-white" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="group">
              <Link href="#careers" data-testid="about-hero-careers-btn">
                <Icon name="rocket" size={17} />
                We&apos;re hiring
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Mission ── */}
      <section
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20"
        id="mission"
        data-testid="about-mission"
      >
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Our mission
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Make the quoted price equal the invoiced price.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Indian commerce loses crores every year to the gap between the shipping fee shown at
              checkout and what the courier actually bills. Stale pincode data, guessed zones and
              ignored volumetric weight turn every order into a small reconciliation headache.
            </p>
            <p className="mt-4 text-muted-foreground">
              Postpin closes that gap with one API call: real India Post-synced pincodes, a
              deterministic zone engine, billable-weight math and a fully itemised, GST-aware charge
              — so the number your customer sees is the number you pay.
            </p>
          </div>

          <Card className="relative overflow-hidden border-primary/20 p-8">
            <div className="pointer-events-none absolute inset-0 bg-brand-gradient opacity-[0.06]" />
            <div className="relative">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-gradient-soft text-primary">
                <Icon name="sparkles" size={24} />
              </span>
              <p className="mt-5 font-display text-xl font-semibold leading-snug">
                &ldquo;A quote is a promise. If the invoice breaks it, the checkout was lying.&rdquo;
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                The problem we exist to solve — and the bar every release is measured against.
              </p>
            </div>
          </Card>
        </div>
      </section>

      {/* ── Traction band ── */}
      <section
        className="relative overflow-hidden border-y border-border bg-brand-gradient"
        data-testid="about-traction-band"
      >
        <div className="absolute inset-0 bg-grid opacity-10" />
        <div className="relative mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-12 text-white sm:px-6 lg:grid-cols-4 lg:py-14">
          {TRACTION.map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-display text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
                {s.value}
              </p>
              <p className="mt-1 text-sm text-white/80">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Timeline ── */}
      <section
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20"
        id="timeline"
        data-testid="about-timeline"
      >
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Milestones
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            From a courier headache to a national API
          </h2>
        </div>

        <ol className="relative mt-12 space-y-8 before:absolute before:left-[19px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-gradient-to-b before:from-primary before:to-brand-accent/40 sm:before:left-[23px]">
          {TIMELINE.map((m) => (
            <li
              key={m.id}
              className="group relative flex gap-5 pl-0"
              data-testid={`about-timeline-item-${m.id}`}
            >
              <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full border border-primary/20 bg-card text-primary shadow-glow sm:size-12">
                <Icon name={m.icon} size={20} />
              </span>
              <div className="pt-0.5 sm:pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold tabular-nums text-primary">
                    {m.year}
                  </span>
                  <h3 className="font-display text-lg font-semibold">{m.title}</h3>
                </div>
                <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{m.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Values ── */}
      <section className="border-y border-border bg-card/40">
        <div
          className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20"
          data-testid="about-values-grid"
        >
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              What we value
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              The principles behind every release
            </h2>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((v) => (
              <Card
                key={v.id}
                className="group p-6 transition-colors hover:border-primary/30"
                data-testid={`about-value-card-${v.id}`}
              >
                <span className="grid size-11 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                  <Icon name={v.icon} size={22} />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold">{v.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{v.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Team ── */}
      <section
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20"
        id="team"
        data-testid="about-team-grid"
      >
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            The team
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            A small, senior team shipping for India
          </h2>
          <p className="mt-3 text-muted-foreground">
            Engineers, designers and operators who&apos;ve shipped logistics and payments at scale —
            now building the rate layer they always wished existed.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {TEAM.map((member) => (
            <Card
              key={member.id}
              className="flex flex-col items-center p-6 text-center"
              data-testid={`about-team-card-${member.id}`}
            >
              <Avatar className="size-20 ring-1 ring-border">
                <AvatarImage
                  src={`https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(
                    member.seed,
                  )}&backgroundType=gradientLinear`}
                  alt={member.name}
                />
                <AvatarFallback>
                  {member.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <h3 className="mt-4 font-display text-base font-semibold">{member.name}</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">{member.role}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Blog teaser ── */}
      <section className="border-y border-border bg-card/40">
        <div
          className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20"
          id="blog"
          data-testid="about-blog-teaser"
        >
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-xl">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                From the blog
              </p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Notes on shipping, pincodes &amp; the rate engine
              </h2>
            </div>
            <Button asChild variant="outline" className="group shrink-0">
              <Link href="/docs#changelog" data-testid="about-blog-all-btn">
                All posts
                <Icon name="arrowRight" size={16} />
              </Link>
            </Button>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {POSTS.map((post) => (
              <Card
                key={post.id}
                className="group flex flex-col p-6 transition-colors hover:border-primary/30"
                data-testid={`about-blog-card-${post.id}`}
              >
                <Badge variant="muted" className="w-fit">
                  {post.category}
                </Badge>
                <h3 className="mt-4 font-display text-lg font-semibold leading-snug">
                  {post.title}
                </h3>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{post.excerpt}</p>
                <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="tabular-nums">{post.date}</span>
                  <span className="flex items-center gap-1.5">
                    <Icon name="clock" size={13} />
                    {post.readMins} min read
                  </span>
                </div>
                <Link
                  href="/docs#changelog"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                  data-testid={`about-blog-readmore-${post.id}`}
                >
                  Read in docs
                  <Icon name="arrowRight" size={15} />
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Careers ── */}
      <section
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20"
        id="careers"
        data-testid="about-careers-list"
      >
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Careers
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Help us price every parcel in India
            </h2>
            <p className="mt-4 text-muted-foreground">
              We&apos;re a remote-friendly team based in Jaipur, hiring across engineering, data,
              sales and developer relations. Strong ownership, honest pricing, real problems.
            </p>
            <Button asChild variant="gradient" size="lg" className="mt-6">
              <Link href="/contact" data-testid="about-careers-cta-btn">
                See all openings
                <Icon name="arrowRight" size={17} className="text-white" />
              </Link>
            </Button>
          </div>

          {ROLES.length > 0 ? (
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {ROLES.map((role) => (
                <li key={role.id}>
                  <Link
                    href="/contact"
                    className="group flex items-center gap-4 p-5 transition-colors hover:bg-accent"
                    data-testid={`about-role-row-${role.id}`}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-gradient-soft text-primary">
                      <Icon name="rocket" size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-semibold">{role.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span>{role.dept}</span>
                        <span aria-hidden="true">·</span>
                        <span>{role.location}</span>
                        <span aria-hidden="true">·</span>
                        <Badge variant="secondary" className="font-normal">
                          {role.type}
                        </Badge>
                      </p>
                    </div>
                    <Icon
                      name="chevronRight"
                      size={18}
                      className="shrink-0 text-muted-foreground"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Card className="flex flex-col items-center justify-center p-10 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-gradient-soft text-primary">
                <Icon name="mail" size={24} />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold">No open roles right now</h3>
              <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                We&apos;re always glad to meet exceptional people. Send us a note and tell us how
                you&apos;d make Indian shipping better.
              </p>
              <Button asChild variant="outline" className="mt-5">
                <Link href="/contact" data-testid="about-careers-empty-btn">
                  Send us a note
                </Link>
              </Button>
            </Card>
          )}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Card className="relative overflow-hidden border-primary/20 p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute inset-0 bg-brand-gradient opacity-[0.06]" />
          <div className="relative">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Build on the rate API India deserves.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              1,000 free rate calls every month. No credit card. Be live in five minutes.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="gradient" size="lg">
                <Link href="/signup" data-testid="about-final-cta-signup-btn">
                  Create free account
                  <Icon name="arrowRight" size={17} className="text-white" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/contact" data-testid="about-final-cta-contact-btn">
                  Talk to sales
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      </section>
    </>
  );
}
