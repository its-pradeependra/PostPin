import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Icon } from "@/components/icons";
import { FooterStatusPill } from "@/components/layout/footer-status-pill";
import { marketingFooter, site } from "@/lib/site";

const testId = (value: string) =>
  value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-card/40" data-testid="marketing-footer">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-x-8 gap-y-12 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-4" data-testid="marketing-footer-brand">
            <Logo size="md" />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {site.description}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Link
                href={`mailto:${site.email}`}
                aria-label="Email"
                data-testid="footer-email-link"
                className="group grid size-9 place-items-center rounded-lg border border-border transition-colors hover:bg-accent"
              >
                <Icon name="mail" trigger="group-hover" size={17} />
              </Link>
              <FooterStatusPill />
            </div>
          </div>

          <nav
            aria-label="Footer"
            data-testid="marketing-footer-nav"
            className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:col-span-8"
          >
            {marketingFooter.map((col) => (
              <div key={col.heading} className="space-y-3">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {col.heading}
                </p>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.title}>
                      <Link
                        href={link.href}
                        data-testid={`footer-link-${testId(link.href)}`}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row">
          <p>© 2026 {site.name}. Shipping rates for every Indian pincode.</p>
          <p className="font-mono text-xs">Made in India 🇮🇳 · {site.apiBase}</p>
        </div>
      </div>
    </footer>
  );
}
