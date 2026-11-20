import Link from "next/link";
import { cn } from "@/lib/cn";

/** FairGround wordmark: a level-line mark plus the name. */
export function Logo({ inverse = false, className }: { inverse?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5", className)} aria-label="FairGround home">
      <svg aria-hidden viewBox="0 0 32 32" className="size-8 shrink-0">
        <rect width="32" height="32" rx="6" fill="var(--safety)" />
        <rect x="6" y="19" width="20" height="4" rx="1" fill="var(--charcoal)" />
        <rect x="9" y="9" width="4" height="10" fill="var(--charcoal)" />
        <rect x="19" y="9" width="4" height="10" fill="var(--charcoal)" />
      </svg>
      <span
        className={cn(
          "font-heading text-xl font-bold tracking-[-0.02em]",
          inverse ? "text-white" : "text-charcoal",
        )}
      >
        FairGround
      </span>
    </Link>
  );
}
