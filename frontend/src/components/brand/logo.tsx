import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { site } from "@/lib/site";

interface LogoProps {
  className?: string;
  href?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
}

// logo.png is 1774x506 (≈3.5:1); heights below keep it crisp at each slot.
const sizes = {
  sm: { wordmark: "h-6", mark: "size-8" },
  md: { wordmark: "h-8", mark: "size-9" },
  lg: { wordmark: "h-10", mark: "size-11" },
};

/* The wordmark's navy "Post" disappears on the dark navy theme;
   invert + hue-rotate keeps the text light and the pin red. */
const darkModeFix = "dark:[filter:invert(1)_hue-rotate(180deg)]";

export function Logo({ className, href = "/", showWordmark = true, size = "md" }: LogoProps) {
  const s = sizes[size];
  const content = showWordmark ? (
    <Image
      src="/logo.png"
      alt={site.name}
      width={1774}
      height={506}
      priority
      data-testid="brand-logo-img"
      className={cn("w-auto", s.wordmark, darkModeFix, className)}
    />
  ) : (
    <Image
      src="/favicon/favicon-96x96.png"
      alt={site.name}
      width={96}
      height={96}
      data-testid="brand-logo-img"
      className={cn("shrink-0", s.mark, className)}
    />
  );

  if (href) {
    return (
      <Link href={href} data-testid="brand-logo-link" aria-label={site.name} className="flex items-center">
        {content}
      </Link>
    );
  }
  return content;
}
