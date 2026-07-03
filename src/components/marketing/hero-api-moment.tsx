"use client";

import * as React from "react";
import Link from "next/link";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { calculateRate } from "@/lib/shipping";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

// Truthful: every displayed value comes from the real engine, so it can never drift.
const RESULT = calculateRate({
  origin: "400001",
  destination: "110001",
  weightGrams: 1200,
  service: "express",
  cod: false,
});

type Phase = "idle" | "sending" | "streaming" | "settled";

// Quadratic Bézier sample (primary packet transport, no offset-path dependency).
const P0 = { x: 8, y: 30 };
const P1 = { x: 60, y: 6 };
const P2 = { x: 112, y: 30 };
const WIRE = `M ${P0.x} ${P0.y} Q ${P1.x} ${P1.y} ${P2.x} ${P2.y}`;
const quad = (a: number, b: number, c: number, t: number) =>
  (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

export function HeroApiMoment() {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [phase, setPhase] = React.useState<Phase>(reduce ? "settled" : "idle");
  const [amount, setAmount] = React.useState(reduce ? RESULT.total : 0);

  // Single phase machine (idle → sending → streaming → settled).
  React.useEffect(() => {
    if (reduce) {
      setPhase("settled");
      return;
    }
    if (!inView) return;
    const timers = [
      setTimeout(() => setPhase("sending"), 250),
      setTimeout(() => setPhase("streaming"), 900),
      setTimeout(() => setPhase("settled"), 1650),
    ];
    return () => timers.forEach(clearTimeout);
  }, [inView, reduce]);

  // Count-up once the response settles.
  React.useEffect(() => {
    if (phase !== "settled") return;
    const controls = animate(0, RESULT.total, {
      duration: reduce ? 0 : 0.7,
      ease: "easeOut",
      onUpdate: (v) => setAmount(v),
    });
    return () => controls.stop();
  }, [phase, reduce]);

  // Packet travels the wire during "sending".
  const progress = useMotionValue(reduce ? 1 : 0);
  React.useEffect(() => {
    if (reduce) return;
    if (phase === "sending") {
      const c = animate(progress, 1, { duration: 0.65, ease: "easeInOut" });
      return () => c.stop();
    }
  }, [phase, reduce, progress]);
  const cx = useTransform(progress, (t) => quad(P0.x, P1.x, P2.x, t));
  const cy = useTransform(progress, (t) => quad(P0.y, P1.y, P2.y, t));
  const packetOpacity = useTransform(progress, [0, 0.05, 0.95, 1], [0, 1, 1, 0.9]);

  const streaming = phase === "streaming" || phase === "settled";
  const settled = phase === "settled";

  const lineV = reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } };

  return (
    <section
      data-testid="hero-api-moment-section"
      className="relative isolate overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]" />
      <div className="pointer-events-none absolute -top-24 right-[8%] -z-10 size-[34rem] rounded-full bg-brand-gradient opacity-[0.16] blur-[130px]" />

      <div className="mx-auto max-w-6xl px-4 pb-8 pt-16 sm:px-6 lg:pt-24">
        {/* Headline */}
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-balance font-display text-[2.75rem] font-bold leading-[1.04] tracking-tight sm:text-6xl">
            One call. <span className="text-gradient">The real rate.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
            POST two pincodes, a weight and a COD flag. Get back an accurate, GST-aware shipping
            charge in one response.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="gradient" size="lg">
              <Link href="/signup" data-testid="hero-cta-signup">
                Start free
                <Icon name="arrowRight" trigger="group-hover" size={17} className="text-white" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs" data-testid="hero-cta-docs">
                <Icon name="code" trigger="group-hover" size={17} />
                Read the docs
              </Link>
            </Button>
          </div>
        </div>

        {/* The API moment */}
        <div
          ref={ref}
          className="mt-14 flex flex-col items-stretch gap-5 lg:flex-row lg:items-center"
        >
          {/* REQUEST */}
          <Panel
            testId="hero-request-panel"
            className="hidden md:block lg:flex-1 lg:rotate-[1.2deg]"
          >
            <PanelHeader>
              <span className="rounded bg-success/12 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-success">
                POST
              </span>
              <span className="font-mono text-[12px] tracking-wide text-muted-foreground">
                /v1/rates
              </span>
              <button
                type="button"
                data-testid="hero-api-send-btn"
                className="group ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-accent"
              >
                <Icon name="send" trigger="group-hover" size={12} className="text-primary" />
                Send
              </button>
            </PanelHeader>
            <div className="space-y-0.5 px-4 py-3.5 font-mono text-[12.5px] leading-relaxed">
              <Ln>{"{"}</Ln>
              <Ln indent><K>"origin"</K>: <S>"400001"</S>,</Ln>
              <Ln indent><K>"destination"</K>: <S>"110001"</S>,</Ln>
              <Ln indent><K>"weight"</K>: <N>1200</N>,</Ln>
              <Ln indent><K>"service"</K>: <S>"express"</S>,</Ln>
              <Ln indent><K>"cod"</K>: <N>false</N></Ln>
              <Ln>{"}"}</Ln>
            </div>
          </Panel>

          {/* CONNECTOR (lg only) */}
          <div className="hidden w-24 shrink-0 lg:block" aria-hidden>
            <svg viewBox="0 0 120 60" className="h-16 w-full overflow-visible">
              <defs>
                <linearGradient id="brandWire" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="var(--brand-from)" />
                  <stop offset="0.5" stopColor="var(--brand-via)" />
                  <stop offset="1" stopColor="var(--brand-to)" />
                </linearGradient>
              </defs>
              <path d={WIRE} stroke="url(#brandWire)" strokeWidth={5} fill="none" opacity={0.22} className="blur-[2px]" />
              <motion.path
                d={WIRE}
                stroke="url(#brandWire)"
                strokeWidth={1.5}
                fill="none"
                strokeDasharray="4 6"
                style={{ animation: "dash-flow 1.1s linear infinite" }}
                initial={{ pathLength: reduce ? 1 : 0 }}
                animate={{ pathLength: phase === "idle" ? 0 : 1 }}
                transition={{ duration: reduce ? 0 : 0.5 }}
              />
              <motion.circle cx={cx} cy={cy} r={3.4} fill="var(--brand-to)" style={{ opacity: packetOpacity, filter: "drop-shadow(0 0 5px var(--brand-to))" }} />
            </svg>
          </div>

          {/* RESPONSE */}
          <Panel
            testId="hero-response-panel"
            className="relative lg:flex-[1.18] lg:-rotate-[1.2deg]"
            glow
          >
            <PanelHeader>
              <span className="relative flex size-2">
                {settled && (
                  <span className="absolute inline-flex size-full rounded-full bg-success/60" style={{ animation: "pulse-ring 2.2s ease-out 1" }} />
                )}
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              <span className="font-mono text-[12px] font-semibold text-success">200 OK</span>
              <span
                data-testid="hero-latency-pill"
                className="shimmer rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground"
              >
                served in 11 ms
              </span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">req_f1e2d3</span>
              {/* mobile request hint */}
              <span className="md:hidden ml-2 rounded bg-success/12 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-success">
                POST /v1/rates
              </span>
            </PanelHeader>

            {/* Promoted human-readable result */}
            <div className="border-b border-border/70 px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Total shipping charge
              </p>
              <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-2">
                <div className="relative">
                  <span
                    data-testid="hero-rate-total"
                    className="font-display text-[2.75rem] font-bold leading-none tracking-[-0.02em] tabular-nums"
                  >
                    {formatCurrency(amount)}
                  </span>
                  <motion.span
                    className="absolute -bottom-1 left-0 h-[3px] w-full origin-left rounded-full bg-brand-gradient"
                    initial={{ scaleX: reduce ? 1 : 0 }}
                    animate={{ scaleX: settled ? 1 : 0 }}
                    transition={{ duration: reduce ? 0 : 0.5, ease: "easeOut", delay: 0.5 }}
                  />
                </div>
                <div className="flex items-center gap-1.5 pb-1">
                  <Chip show={settled} reduce={reduce} testId="hero-zone-chip">
                    {RESULT.zoneLabel}
                  </Chip>
                  <Chip show={settled} reduce={reduce} testId="hero-eta-chip">
                    ETA {RESULT.etaDays[0]}-{RESULT.etaDays[1]} days
                  </Chip>
                </div>
              </div>
              <span className="sr-only">
                Postpin returns {formatCurrency(RESULT.total)} for a 1.2 kg express parcel from
                Mumbai 400001 to Delhi 110001, {RESULT.zoneLabel} zone, {RESULT.etaDays[0]} to{" "}
                {RESULT.etaDays[1]} days.
              </span>
            </div>

            {/* Raw JSON payload (streams in) */}
            <motion.div
              className="space-y-0.5 px-4 py-3.5 font-mono text-[12.5px] leading-relaxed"
              initial="hidden"
              animate={streaming ? "show" : "hidden"}
              variants={{ show: { transition: { staggerChildren: reduce ? 0 : 0.045 } } }}
            >
              {[
                <Ln key="o">{"{"}</Ln>,
                <Ln key="t" indent><K>"total"</K>: <N>236.83</N>,</Ln>,
                <Ln key="c" indent><K>"currency"</K>: <S>"INR"</S>,</Ln>,
                <Ln key="z" indent><K>"zone"</K>: <S>"metro"</S>,</Ln>,
                <Ln key="e" indent><K>"eta_days"</K>: <N>[1, 3]</N>,</Ln>,
                <Ln key="b" indent><K>"breakdown"</K>: <span className="text-muted-foreground">[ base 88.00, weight 91.20, fuel 21.50, gst 36.13 ]</span>,</Ln>,
                <Ln key="m" indent><K>"meta"</K>: <span className="text-muted-foreground">{"{"} <K>"cached"</K>: <N>true</N> {"}"}</span></Ln>,
                <Ln key="x">{"}"}</Ln>,
              ].map((line) => (
                <motion.div key={(line as React.ReactElement).key} variants={lineV}>
                  {line}
                </motion.div>
              ))}
            </motion.div>
          </Panel>
        </div>
      </div>
    </section>
  );
}

/* ── Building blocks ─────────────────────────────────────────── */

function Panel({
  children,
  className,
  testId,
  glow,
}: {
  children: React.ReactNode;
  className?: string;
  testId: string;
  glow?: boolean;
}) {
  return (
    <div data-testid={testId} className={cn("relative", className)}>
      {glow && (
        <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[1.75rem] bg-brand-gradient opacity-[0.12] blur-2xl" />
      )}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-26px] shadow-primary/25 ring-hairline">
        {children}
      </div>
    </div>
  );
}

function PanelHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-border/70 bg-gradient-to-r from-primary/[0.04] to-transparent px-4 py-2.5">
      {children}
    </div>
  );
}

function Ln({ children, indent }: { children: React.ReactNode; indent?: boolean }) {
  return <div className={cn("text-foreground/90", indent && "pl-4")}>{children}</div>;
}
function K({ children }: { children: React.ReactNode }) {
  return <span className="text-foreground">{children}</span>;
}
function S({ children }: { children: React.ReactNode }) {
  return <span className="text-fuchsia">{children}</span>;
}
function N({ children }: { children: React.ReactNode }) {
  return <span className="text-info">{children}</span>;
}

function Chip({
  children,
  show,
  reduce,
  testId,
}: {
  children: React.ReactNode;
  show: boolean;
  reduce: boolean | null;
  testId: string;
}) {
  return (
    <motion.span
      data-testid={testId}
      initial={{ opacity: reduce ? 1 : 0, scale: reduce ? 1 : 0.8 }}
      animate={{ opacity: show ? 1 : 0, scale: show ? 1 : 0.8 }}
      transition={{ type: "spring", stiffness: 420, damping: 18, delay: reduce ? 0 : 0.35 }}
      className="inline-flex items-center rounded-full border border-border/70 bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground"
    >
      {children}
    </motion.span>
  );
}
