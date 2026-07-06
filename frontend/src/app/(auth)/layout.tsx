import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Icon } from "@/components/icons";

// Transactional auth pages (reset password, verify email, accept invite…)
// must not be indexed. /login and /signup override this in their own layouts.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-2">
      {/* Left: form */}
      <div className="relative flex flex-col">
        <header className="flex items-center justify-between p-6">
          <Logo />
          <ThemeToggle />
        </header>
        <div className="flex flex-1 items-center justify-center px-4 pb-16 pt-4">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <footer className="px-6 pb-6 text-xs text-muted-foreground">
          <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
          <span className="mx-2">·</span>
          <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
        </footer>
      </div>

      {/* Right: brand panel */}
      <div className="relative hidden overflow-hidden bg-brand-gradient lg:block">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute -bottom-24 -right-24 size-[28rem] rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Icon name="zap" size={18} className="text-white" />
            Sub-50ms shipping rates · 1,57,000+ pincodes
          </div>
          <div className="space-y-6">
            <p className="font-display text-3xl font-bold leading-tight">
              “We replaced three courier rate sheets with one Postpin call. Our checkout shipping
              estimate went from minutes to milliseconds.”
            </p>
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-white/20 font-display font-bold">
                AS
              </div>
              <div>
                <p className="font-semibold">Aarav Sharma</p>
                <p className="text-sm text-white/80">Head of Engineering, FlipMart</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/80">
            <span className="flex items-center gap-1.5">
              <Icon name="shieldCheck" size={16} className="text-white" /> 99.9% uptime
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="sync" size={16} className="text-white" /> Auto India Post sync
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
