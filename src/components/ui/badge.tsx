import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "dark";

// Light tinted background + dark text of the same hue (WCAG AA).
const tones: Record<BadgeTone, string> = {
  neutral: "bg-plaster-2 text-charcoal border-line",
  info: "bg-[#E3EAF0] text-steel-dark border-[#C5D3DE]",
  success: "bg-[#E2F0E7] text-[#1F5A37] border-[#BFDCC9]",
  warning: "bg-[#FCF1CC] text-[#5C4500] border-[#EBD68A]",
  danger: "bg-[#F7E1DF] text-[#8A1D17] border-[#E8BDB9]",
  dark: "bg-charcoal text-white border-charcoal",
};

export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[4px] border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
