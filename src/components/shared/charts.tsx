"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

const axisProps = {
  stroke: "var(--muted-foreground)",
  tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-medium text-foreground">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 tabular-nums text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color ?? p.fill }} />
          <span className="capitalize">{p.name}:</span>
          <span className="font-semibold text-foreground">
            {formatter ? formatter(p.value, p.name) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  description,
  action,
  children,
  className,
  testId,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Card data-testid={testId ?? "chart-card"} className={cn("p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** Area trend (e.g. API calls over time). */
export function AreaTrend({
  data,
  dataKey = "calls",
  xKey = "label",
  height = 240,
  color = "var(--chart-1)",
  valueFormatter,
}: {
  data: any[];
  dataKey?: string;
  xKey?: string;
  height?: number;
  color?: string;
  valueFormatter?: (v: number) => string;
}) {
  const id = React.useId().replace(/:/g, "");
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis dataKey={xKey} {...axisProps} minTickGap={24} />
        <YAxis {...axisProps} width={48} tickFormatter={(v) => (valueFormatter ? valueFormatter(v) : v)} />
        <Tooltip content={<ChartTooltip formatter={valueFormatter} />} cursor={{ stroke: "var(--border)" }} />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#area-${id})`}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Vertical bars (e.g. monthly revenue). */
export function BarTrend({
  data,
  dataKey,
  xKey,
  height = 240,
  color = "var(--chart-1)",
  valueFormatter,
}: {
  data: any[];
  dataKey: string;
  xKey: string;
  height?: number;
  color?: string;
  valueFormatter?: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
        <XAxis dataKey={xKey} {...axisProps} />
        <YAxis {...axisProps} width={48} tickFormatter={(v) => (valueFormatter ? valueFormatter(v) : v)} />
        <Tooltip content={<ChartTooltip formatter={valueFormatter} />} cursor={{ fill: "var(--muted)" }} />
        <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Horizontal labeled bar list (e.g. top endpoints). */
export function BarList({
  items,
  valueFormatter = (v) => String(v),
}: {
  items: { label: string; value: number }[];
  valueFormatter?: (v: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-mono text-xs text-foreground">{item.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
              {valueFormatter(item.value)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-brand-gradient"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Donut (e.g. status breakdown). */
export function StatusDonut({
  data,
  height = 220,
}: {
  data: { label: string; value: number; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="62%"
          outerRadius="92%"
          paddingAngle={2}
          stroke="var(--card)"
          strokeWidth={2}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}%`} />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Tiny sparkline for stat cards. */
export function Sparkline({
  data,
  color = "var(--chart-1)",
  height = 40,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  const series = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={series} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
