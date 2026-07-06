import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/icons";
import { site } from "@/lib/site";

interface LogoProps {
  className?: string;
  href?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { box: "size-8 rounded-lg", icon: 17, text: "text-base" },
  md: { box: "size-9 rounded-xl", icon: 20, text: "text-xl" },
  lg: { box: "size-11 rounded-2xl", icon: 24, text: "text-2xl" },
};

export function Logo({ className, href = "/", showWordmark = true, size = "md" }: LogoProps) {
  const s = sizes[size];
  const content = (
    <span className={cn("group flex items-center gap-2", className)}>
      <span
        className={cn(
          "grid shrink-0 place-items-center bg-brand-gradient text-white shadow-glow",
          s.box,
        )}
      >
        <Icon name="pin" size={s.icon} className="text-white" />
      </span>
      {showWordmark && (
        <span className={cn("font-display font-bold tracking-tight", s.text)}>{site.name}</span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} data-testid="brand-logo-link" aria-label={site.name}>
        {content}
      </Link>
    );
  }
  return content;
}
