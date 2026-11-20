import { Check } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateOnly, money } from "@/lib/format";
import type { AppSettings } from "@/lib/settings";

export function PricingTable({ settings: s }: { settings: AppSettings }) {
  const deadline = formatDateOnly(s.beta_signup_deadline);
  const launch = formatDateOnly(s.ga_launch_date);

  const plans = [
    {
      key: "beta",
      name: "Founding member",
      note: s.beta_open
        ? deadline
          ? `Sign up by ${deadline}`
          : "Limited founding spots available"
        : "Founding spots are closed",
      monthly: s.beta_monthly_cents,
      setup: s.beta_setup_cents,
      overage: s.beta_overage_cents,
      extra: `Beta price locked for ${s.founding_lock_months} months, with 60 days notice before any change.`,
      highlight: s.beta_open,
      cta: s.beta_open ? { href: "/signup?role=provider", label: "Claim a founding spot" } : null,
    },
    {
      key: "standard",
      name: "Standard",
      note: launch ? `General availability from ${launch}` : "General availability",
      monthly: s.std_monthly_cents,
      setup: s.std_setup_cents,
      overage: s.std_overage_cents,
      extra: "Month to month. Cancel any time.",
      highlight: !s.beta_open,
      cta: s.beta_open ? null : { href: "/signup?role=provider", label: "Join FairGround" },
    },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {plans.map((p) => (
        <div
          key={p.key}
          className={
            p.highlight
              ? "relative overflow-hidden rounded-[10px] border-2 border-charcoal bg-white"
              : "relative overflow-hidden rounded-[10px] border border-line bg-white"
          }
        >
          {p.highlight ? <div aria-hidden className="safety-stripe h-2" /> : null}
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-2xl">{p.name}</h3>
              {p.highlight && p.key === "beta" ? <Badge tone="warning">Founding</Badge> : null}
            </div>
            <p className="mt-1 text-sm font-medium text-muted">{p.note}</p>
            <p className="tabular mt-6 font-heading text-5xl font-bold">
              {money(p.monthly)}
              <span className="font-body text-lg font-medium text-muted">/month</span>
            </p>
            <ul className="mt-6 space-y-3 text-[15px]">
              {[
                p.setup === 0 ? "$0 setup fee" : `${money(p.setup)} one-time setup fee`,
                `${s.included_requests} exclusive requests included every month`,
                `${money(p.overage)} per extra request, only if you opt in`,
                "Requests pause automatically at your limit unless you choose otherwise",
                "Pause or resume any time, no penalty",
                p.extra,
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
                  <span className="tabular">{line}</span>
                </li>
              ))}
            </ul>
            {p.cta ? (
              <LinkButton href={p.cta.href} className="mt-8 w-full" size="lg">
                {p.cta.label}
              </LinkButton>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
