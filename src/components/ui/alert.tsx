import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "danger";

const styles: Record<Tone, string> = {
  info: "border-[#C5D3DE] bg-[#EEF3F7] text-steel-dark",
  success: "border-[#BFDCC9] bg-[#EDF6F0] text-[#1F5A37]",
  warning: "border-[#EBD68A] bg-[#FDF6DD] text-[#4D3A00]",
  danger: "border-[#E8BDB9] bg-[#FBEDEC] text-[#8A1D17]",
};

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Icon = icons[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-[6px] border px-4 py-3 text-[15px]", styles[tone], className)}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}
