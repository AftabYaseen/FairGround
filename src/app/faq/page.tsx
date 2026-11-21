import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/marketing/prose-page";
import { money } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "FAQ" };

export default async function FaqPage() {
  const s = await getSettings();
  const faqs: { q: string; a: React.ReactNode }[] = [
    {
      q: "What is the Beta Access Program?",
      a: "It gives early businesses access to FairGround before public launch. Founding members help shape the product and lock in preferred pricing.",
    },
    {
      q: "Who is FairGround for?",
      a: "Home service and commercial service providers such as contractors, cleaners, landscapers and facility services. Any professional who accepts client requests is welcome.",
    },
    {
      q: "How much does it cost?",
      a: `Founding members pay ${money(s.beta_setup_cents)} setup and ${money(s.beta_monthly_cents)} a month, including ${s.included_requests} requests. Extra requests are ${money(s.beta_overage_cents)} each, only if you opt in. Standard pricing is ${money(s.std_setup_cents)} setup and ${money(s.std_monthly_cents)} a month, with extra requests at ${money(s.std_overage_cents)}.`,
    },
    {
      q: "How is this different from Angi, HomeAdvisor or Thumbtack?",
      a: "No shared leads, no auctions or bidding wars, flat monthly pricing, you control how many requests you get, you can pause any time, and there are no surprise fees.",
    },
    {
      q: "What counts as a service request?",
      a: "A verified inquiry from a client who has given their name, email, phone number and the details of the job. No anonymous or incomplete requests are delivered.",
    },
    {
      q: "What happens when I reach my monthly limit?",
      a: `When you reach ${s.included_requests} requests you choose: pause until next month, or keep receiving requests at the extra request price. You are always in control.`,
    },
    { q: "Can I turn requests off for a while?", a: "Yes. Pause or resume with one click at any time. There is no penalty for pausing." },
    {
      q: "Why are there no refunds for requests?",
      a: "Every request is exclusive and delivered in good faith. If a request is spam or fake, our team marks it invalid and it does not count toward your bill.",
    },
    {
      q: "Will my price go up after the beta?",
      a: `Founding members keep beta pricing for ${s.founding_lock_months} months from sign-up. After that standard pricing applies, with 60 days notice. No surprise increases.`,
    },
    { q: "Is there a long-term contract?", a: "No. It is month to month and you can cancel at any time." },
    {
      q: "Why do you need my business and contact information?",
      a: "Real business information keeps request quality high, prevents spam and maintains trust across the network.",
    },
    {
      q: "How many beta spots are there?",
      a: `Founding access is limited to ${s.beta_capacity} businesses and closes once capacity is reached.`,
    },
    {
      q: "As a client, why can I only send one request at a time?",
      a: (
        <>
          So providers are treated fairly and never pushed into bidding wars. Read the{" "}
          <Link href="/fairness-policy" className="link">
            fairness policy
          </Link>
          .
        </>
      ),
    },
  ];

  return (
    <ProsePage title="Frequently asked questions">
      <div className="divide-y divide-line rounded-[10px] border border-line bg-white">
        {faqs.map((f) => (
          <details key={f.q} className="group p-5">
            <summary className="cursor-pointer list-none font-heading text-lg font-bold [&::-webkit-details-marker]:hidden">
              <span className="mr-2 inline-block text-muted group-open:rotate-90">›</span>
              {f.q}
            </summary>
            <p className="mt-3 text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </ProsePage>
  );
}
