import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

/** Diagonal charcoal and yellow band, like hazard tape. Decorative only. */
export function SafetyStripe({ className }: { className?: string }) {
  return <div aria-hidden className={cn("safety-stripe h-2.5 w-full", className)} />;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {eyebrow ? <p className="text-sm font-semibold uppercase tracking-wider text-muted">{eyebrow}</p> : null}
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {description ? <p className="max-w-2xl text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      <p className="font-heading text-xl font-bold">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-muted">{children}</div> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-line bg-white p-5">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="tabular mt-1 font-heading text-3xl font-bold">{value}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}
