import { MarketingNav } from "@/components/layout/marketing-nav";
import { MarketingFooter } from "@/components/layout/marketing-footer";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingNav />
      <div className="flex-1">{children}</div>
      <MarketingFooter />
    </div>
  );
}
