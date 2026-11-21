import { formatDateOnly, money } from "@/lib/format";
import type { Tables } from "@/types/database";

/** The exact authorisation text shown to the provider and stored with their consent. */
export function consentText(s: Tables<"app_settings">, provider: Pick<Tables<"providers">, "plan" | "plan_price_locked_until" | "monthly_cap">, setupDue: boolean): string {
  const beta = provider.plan === "beta";
  const monthly = beta ? s.beta_monthly_cents : s.std_monthly_cents;
  const setup = beta ? s.beta_setup_cents : s.std_setup_cents;
  const overage = beta ? s.beta_overage_cents : s.std_overage_cents;
  const lock = beta && provider.plan_price_locked_until ? formatDateOnly(provider.plan_price_locked_until) : null;
  return [
    `I authorise OPAL Quality Systems Management (FairGround) to charge my card ${money(monthly)} each month for the ${beta ? "founding member" : "standard"} plan, which includes ${provider.monthly_cap} requests, starting today and continuing until I cancel.`,
    setupDue && setup > 0 ? `I also authorise a one-time setup fee of ${money(setup)} today.` : null,
    `Extra requests are charged at ${money(overage)} each at the end of the month, only if I have turned extra requests on.`,
    lock ? `My monthly price is locked until ${lock}, and FairGround will give me 60 days notice before any change.` : null,
    "Requests are not refundable. I can cancel at any time.",
  ]
    .filter(Boolean)
    .join(" ");
}
