# Product

## Register

product

## Users

Developers and founders at Indian ecommerce, D2C and logistics companies. They integrate the Postpin API into checkouts and ERPs, then live in the dashboard: watching usage, managing API keys, rate cards, billing and support. Context: technical people mid-workflow who want answers fast; the marketing site's secondary audience is a CTO evaluating the API against building rate sheets in-house.

## Product Purpose

Postpin is a multi-tenant SaaS that calculates accurate shipping charges between any two Indian pincodes in a single API call, with the pincode master auto-synced nightly from India Post. Success = a developer gets their first real quote in under five minutes, and the quoted price always equals the invoiced price.

## Brand Personality

Precise, developer-first, honestly Indian. Confident engineering tone without hype: real numbers (19k+ pincodes, <50ms p99), INR-first, GST-aware. The violet→pink gradient is the single identity carrier; everything around it stays calm and legible.

## Anti-references

- Generic "AI SaaS" landing tropes: gradient text, glass cards everywhere, hero-metric walls.
- Enterprise-suite density (SAP/Oracle-style) — this is a focused tool, not a suite.
- Dark-patterned consent/marketing UX: nothing that nags, traps or pre-checks.

## Design Principles

1. **The quote is the product** — pricing data always renders with maximum clarity: tabular numerals, explicit currency, visible breakdowns.
2. **Honest by default** — never fake data, states or capabilities in the UI; empty and error states tell the truth.
3. **Fast paths for repeat work** — dashboard flows optimize the tenth visit, not the demo.
4. **One gradient, used sparingly** — the brand gradient marks primary actions and identity moments only; it never carries body content.
5. **Testable surface** — every interactive element ships with a stable `data-testid`.

## Accessibility & Inclusion

WCAG 2.1 AA target: 4.5:1 body contrast, visible focus rings, full keyboard operability, `prefers-reduced-motion` honored on all animation. Locale-aware number formatting (en-IN lakh/crore grouping) is a product requirement, not a nicety.
