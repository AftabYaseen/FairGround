import { cn } from "@/lib/cn";

export function CapBar({ used, cap, overage }: { used: number; cap: number; overage: number }) {
  const included = Math.min(used, cap);
  const pct = cap > 0 ? Math.min(100, Math.round((included / cap) * 100)) : 100;
  const atCap = cap > 0 && used >= cap;
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <p className="tabular font-heading text-4xl font-bold">
          {included}
          <span className="font-body text-lg font-medium text-muted"> of {cap} used this month</span>
        </p>
        {overage > 0 ? <p className="tabular text-sm font-semibold text-steel-dark">+{overage} extra</p> : null}
      </div>
      <div
        className="mt-3 h-3 overflow-hidden rounded-full border border-line bg-plaster-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={included}
        aria-label="Included requests used this month"
      >
        <div className={cn("h-full rounded-full", atCap ? "bg-charcoal" : "bg-safety")} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">
        {atCap ? "All included requests used. The count resets on the 1st." : `${cap - included} included requests left this month.`}
      </p>
    </div>
  );
}
