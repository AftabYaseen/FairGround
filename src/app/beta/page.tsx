import type { Metadata } from "next";
import Link from "next/link";
import { PricingTable } from "@/components/marketing/pricing-table";
import { LinkButton } from "@/components/ui/button";
import { Container, SafetyStripe } from "@/components/ui/misc";
import { formatDateOnly } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Founding members",
  description: "Join the FairGround founding member beta and lock in preferred pricing.",
};

export default async function BetaPage() {
  const s = await getSettings();
  const deadline = formatDateOnly(s.beta_signup_deadline);
  return (
    <>
      <section className="bg-charcoal text-white">
        <Container className="py-14 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-safety">Founding member beta</p>
          <h1 className="mt-4 max-w-3xl text-[40px] leading-[1.05] sm:text-6xl">Help shape FairGround and lock in your price.</h1>
          <p className="mt-6 max-w-2xl text-lg text-plaster/90">
            {s.beta_open
              ? deadline
                ? `Founding spots are open until ${deadline}, for the first ${s.beta_capacity} businesses.`
                : `Limited founding spots available, for the first ${s.beta_capacity} businesses.`
              : "Founding spots are closed. Standard pricing applies."}{" "}
            Founding members keep beta pricing for {s.founding_lock_months} months.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/signup?role=provider" size="lg">
              {s.beta_open ? "Claim a founding spot" : "Join FairGround"}
            </LinkButton>
            <LinkButton href="/faq" variant="inverse" size="lg">
              Read the FAQ
            </LinkButton>
          </div>
        </Container>
      </section>
      <SafetyStripe />
      <Container className="py-14">
        <PricingTable settings={s} />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { t: "Month to month", d: "No long-term contract. Cancel any time." },
            { t: "No surprise increases", d: "After the lock period, standard pricing applies with 60 days notice." },
            { t: "Help build it", d: "Use the platform, share feedback and tell us what is missing." },
          ].map((c) => (
            <div key={c.t} className="rounded-[10px] border border-line bg-white p-6">
              <h2 className="text-[22px]">{c.t}</h2>
              <p className="mt-2 text-muted">{c.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center">
          <Link href="/fairness-policy" className="link">
            Read our fairness policy
          </Link>
        </p>
      </Container>
    </>
  );
}
