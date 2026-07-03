# Postpin UI Build Contract

Read this before building any page. It guarantees every page looks and behaves like one product.
Stack: **Next.js 15 App Router · React 19 · TypeScript · Tailwind v4 · shadcn-style components · motion · Recharts**.
Brand: **Postpin**, bold & vibrant, violet→fuchsia. Light theme default + dark. Currency **INR (en-IN)**.

## Golden rules

1. **Animated icons only.** Never import a raw Lucide icon into a page. Use `import { Icon } from "@/components/icons"` → `<Icon name="truck" size={18} />`. In nav/list rows or buttons use `trigger="group-hover"` (parent needs `className="group"`); standalone accent icons use the default hover, or `trigger="loop"` for live indicators. Valid `name`s are the keys in `src/components/icons/index.tsx` (e.g. `dashboard, keys, usage, calculator, billing, support, ticket, settings, users, admin, truck, package, pin, map, zones, rateCard, database, sync, percent, tag, audit, webhook, notifications, analytics, activity, gauge, trending, zap, rocket, sparkles, shield, shieldCheck, lock, verified, star, globe, clock, dollar, plus, copy, check, checkCircle, edit, trash, search, filter, download, upload, send, mail, message, logout, link, external, eye, eyeOff, more, arrowRight, chevronDown, sun, moon, github, help, wallet, coins, company, book, code, terminal, headphones`).
2. **`data-testid` on every interactive/test-relevant element**, pattern `{feature}-{element}-{type}` — e.g. `key-create-btn`, `pincode-sync-run-btn`, `coupon-code-input`, `usage-export-csv-btn`. Dynamic rows use a stable id (`data-testid={\`user-row-${u.id}\`}`), never the array index.
3. **Server Component by default.** Add `"use client"` only when the file uses state, effects, event handlers, motion, or Recharts. Pages that are purely presentational stay server components; extract interactive bits into small client components when helpful.
4. **Use the design tokens, never raw hex.** `bg-background text-foreground bg-card border-border text-muted-foreground bg-primary text-primary-foreground bg-accent`. Brand helpers: `text-gradient`, `bg-brand-gradient`, `bg-brand-gradient-soft`, `shadow-glow`. Status: `text-success|warning|info|destructive` and `/12` tints. Fonts: headings get `font-display`; numbers/code get `font-mono` + `tabular-nums`.
5. **Format with helpers** from `@/lib/format`: `formatCurrency`, `formatNumber`, `formatCompact`, `formatPercent`, `formatDate`, `formatDateTime`, `formatRelativeTime`, `formatLatency`. Never inline `toLocaleString`.
6. **Mobile-first & responsive** (390 / 768 / 1024 / 1440). Tables scroll-x or collapse to cards on small screens. Respect `prefers-reduced-motion` (the Icon/animation layer already does).
7. **Three states** where data lists exist: a populated view, an `<EmptyState …/>`, and skeletons where loading would occur. Use `<Skeleton/>`.

## Available primitives (import from `@/components/ui/<name>`)

`button` (`Button`, variants: default | gradient | secondary | outline | ghost | destructive | success | link; sizes: sm | default | lg | xl | icon; supports `asChild`) ·
`card` (`Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter`) ·
`input`, `textarea`, `label` (`Label`), `checkbox`, `switch`, `radio-group` (`RadioGroup, RadioGroupItem`) ·
`select` (`Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel`) ·
`badge` (`Badge`, variants: default | secondary | outline | success | warning | info | destructive | gradient | muted) ·
`tabs` (`Tabs, TabsList, TabsTrigger, TabsContent`) ·
`dialog` (`Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose`) ·
`sheet` (`Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter`) ·
`dropdown-menu` (`DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator`) ·
`popover` (`Popover, PopoverTrigger, PopoverContent`) · `tooltip` (`Tooltip, TooltipTrigger, TooltipContent, TooltipProvider`) ·
`table` (`Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption`) ·
`accordion` (`Accordion, AccordionItem, AccordionTrigger, AccordionContent`) ·
`progress` (`Progress`, prop `value`, `indicatorClassName`) · `separator`, `skeleton`, `avatar` (`Avatar, AvatarImage, AvatarFallback`), `scroll-area`, `alert` (`Alert, AlertTitle, AlertDescription`, variants info/success/warning/destructive) ·
`sonner` → `import { toast } from "sonner"`.

## Shared components

- `@/components/shared/page-header` → `<PageHeader title description eyebrow>{actions}</PageHeader>` — top of every dashboard/admin page.
- `@/components/shared/stat-card` → `<StatCard label value icon deltaPct hint />` (KPI tiles).
- `@/components/shared/empty-state` → `<EmptyState icon title description>{cta}</EmptyState>`.
- `@/components/shared/status-badge` → `<StatusBadge status="active|open|synced|paid|…" />` and `<StatusDot tone="success|warning|info|destructive|muted" />`.
- `@/components/shared/copy-button` → `<CopyButton value label />`.
- `@/components/shared/code-block` → `<CodeBlock code language filename />` and `<CodeTabs tabs={[{label,language,code}]} />`.
- `@/components/shared/confirm-dialog` → `<ConfirmDialog trigger title description confirmLabel destructive onConfirm />` for destructive actions.
- `@/components/shared/charts` → `ChartCard`, `AreaTrend`, `BarTrend`, `BarList`, `StatusDonut`, `Sparkline` (all client; wrap in a `"use client"` component or use in a client page). Pass colors like `"var(--chart-1)"`..`"var(--chart-5)"`.
- `@/components/shipping/rate-calculator` → `<RateCalculator />` (full) or `compact`; powered by the real engine. Reuse on the playground.
- `@/components/brand/logo` → `<Logo />`. `@/components/theme-toggle` → `<ThemeToggle />`.

## Data & engine (mock layer — wire to real API later, same shapes)

Import from `@/lib/mock-data`:
`currentUser, currentPlan, plans, apiKeys, usageSeries(days), usageSummary, endpointStats, statusBreakdown, recentCalls, invoices, tickets, rateCards, zones, webhooks, webhookDeliveries, notifications, adminMetrics, adminRevenueSeries, adminUsers, adminMembers, promotions, pincodeStats, syncSettings, syncRuns, pincodes, auditLogs, adminTickets`.
Engine from `@/lib/shipping`: `calculateRate(req)`, `classifyZone`, `lookupPincode`, `SAMPLE_PINCODES`, `ZONE_META`, `SERVICE_META`, `sampleRequestBody`.
Types from `@/lib/types`. Site/brand from `@/lib/site` (`site.name`, `site.apiBase`, …).

## Layouts (already built — do NOT recreate)

- Marketing pages live in `src/app/(marketing)/<route>/page.tsx` → wrapped by nav + footer automatically.
- Auth pages live in `src/app/(auth)/<route>/page.tsx` → centered card + brand panel.
- User portal pages live in `src/app/app/<route>/page.tsx` → dashboard shell (sidebar+topbar). The page should NOT render the shell; just render the content (usually starting with `<PageHeader/>`).
- Admin pages live in `src/app/admin/<route>/page.tsx` → admin shell. Same: render content only.
- Docs lives under `src/app/docs/`.

## Page structure convention (dashboard/admin)

```tsx
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="API Keys" description="Create and manage keys for your integrations." eyebrow="Develop">
        <Button variant="gradient" data-testid="key-create-btn">
          <Icon name="plus" trigger="group-hover" size={16} className="text-white" /> Create key
        </Button>
      </PageHeader>
      {/* content: cards, tables, charts… */}
    </div>
  );
}
```

Keep section spacing consistent (`space-y-6` for page sections, `gap-4`/`gap-5` for grids). Cards use `rounded-2xl` (the `Card` default). Buttons that open dialogs use the dialog primitives. Every form input pairs with a `<Label>`; show helper/error text in `text-xs text-muted-foreground` / `text-destructive`.
