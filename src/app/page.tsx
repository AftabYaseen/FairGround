import { Ban, Handshake, Link2, PauseCircle, ShieldCheck, SlidersHorizontal, UserCheck, Wrench } from "lucide-react";
import Link from "next/link";
import { PricingTable } from "@/components/marketing/pricing-table";
import { LinkButton } from "@/components/ui/button";
import { Container, SafetyStripe } from "@/components/ui/misc";
import { getSettings } from "@/lib/settings";

export default async function HomePage() {
  const settings = await getSettings();

  return (
    <>
      {/* Hero */}
      <section className="bg-charcoal text-white">
        <Container className="grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-safety">Not a lead auction</p>
            <h1 className="mt-4 text-[40px] leading-[1.05] sm:text-6xl lg:text-[72px]">
              A fair way to receive service requests.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-plaster/90">
              FairGround protects contractors and service providers from bidding wars, shared leads and surprise fees.
              Every request goes to one provider only. You decide how many you get.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/signup?role=provider" size="lg">
                Join FairGround
              </LinkButton>
              <LinkButton href="/#how-it-works" variant="inverse" size="lg">
                How it works
              </LinkButton>
            </div>
            <p className="mt-6 text-sm text-plaster/70">
              Need a service?{" "}
              <Link href="/providers" className="font-semibold text-safety underline-offset-4 hover:underline">
                Find a provider
              </Link>
            </p>
          </div>

          <div className="rounded-[10px] border border-charcoal-2 bg-charcoal-2 p-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-plaster/70">Every request on FairGround</p>
            <ul className="mt-4 space-y-4">
              {[
                { icon: UserCheck, text: "Comes from a verified client: name, email, phone and job details." },
                { icon: Ban, text: "Goes to one provider. Never shared, never auctioned." },
                { icon: SlidersHorizontal, text: `Counts toward your ${settings.included_requests} included requests a month.` },
                { icon: PauseCircle, text: "Stops when you pause. One click, no penalty." },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex gap-3">
                  <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-safety" />
                  <span className="text-plaster">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>
      <SafetyStripe />

      {/* Why */}
      <section className="py-16 sm:py-20">
        <Container className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-4xl sm:text-[44px]">Why FairGround exists</h2>
            <p className="mt-4 text-lg text-muted">
              Traditional lead platforms send the same job to many contractors and make them fight over it. FairGround was
              built to change that model entirely.
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              "Lead platforms pit contractors against each other.",
              "The same request goes to many providers, creating bidding wars.",
              "Pricing is unpredictable and often unfair.",
              "Contractors pay for requests without any real control.",
            ].map((t) => (
              <li key={t} className="rounded-[10px] border border-line bg-white p-5 font-medium">
                {t}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Principles */}
      <section className="border-y border-line bg-plaster-2 py-16 sm:py-20">
        <Container>
          <h2 className="text-4xl sm:text-[44px]">Built on fairness, by design</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: "One request. One provider.",
                text: "No auctions. No shared requests. No bidding wars. A client can only have one active request on the whole platform.",
              },
              {
                icon: SlidersHorizontal,
                title: "You stay in control.",
                text: `${settings.included_requests} requests a month included. Pause any time. At your limit, you choose to pause or accept extra requests.`,
              },
              {
                icon: Handshake,
                title: "Collaboration over competition.",
                text: "If a job needs more skills, partner with another provider. The client does not shop it around.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-[10px] border border-line bg-white p-6">
                <Icon aria-hidden className="size-7 text-steel" />
                <h3 className="mt-4 text-[22px]">{title}</h3>
                <p className="mt-2 text-muted">{text}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 py-16 sm:py-20">
        <Container>
          <h2 className="text-4xl sm:text-[44px]">How FairGround works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Wrench, title: "Providers join", text: "Create a professional profile and get your own FairGround request link." },
              { icon: Link2, title: "Clients send one request", text: "Through your link or by browsing the network. One active request at a time." },
              { icon: Ban, title: "No bidding, no shopping", text: "Requests are exclusive. You are not competing with anyone for the same job." },
              { icon: Handshake, title: "Do the job or close it", text: "Complete the work, partner up if you need to, or formally close the request." },
            ].map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative rounded-[10px] border border-line bg-white p-6">
                <span className="tabular font-heading text-sm font-bold text-muted">STEP {i + 1}</span>
                <Icon aria-hidden className="mt-3 size-6 text-charcoal" />
                <h3 className="mt-3 text-[22px]">{title}</h3>
                <p className="mt-2 text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Who */}
      <section className="bg-charcoal py-16 text-white sm:py-20">
        <Container className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-4xl sm:text-[44px]">Who FairGround is for</h2>
            <p className="mt-4 text-lg text-plaster/90">
              If you provide legitimate services and value fairness, FairGround is built for you.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-xl text-safety">Built for</h3>
              <ul className="mt-3 space-y-2 text-plaster">
                <li>Home service contractors</li>
                <li>Commercial service providers</li>
                <li>Trades, facilities and service professionals</li>
              </ul>
            </div>
            <div>
              <h3 className="text-xl text-safety">Also open to</h3>
              <ul className="mt-3 space-y-2 text-plaster">
                <li>Professional service providers</li>
                <li>Consultants and specialised service businesses</li>
              </ul>
            </div>
          </div>
        </Container>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 py-16 sm:py-20">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-4xl sm:text-[44px]">Simple, predictable pricing</h2>
            <p className="mt-4 text-lg text-muted">
              FairGround will never charge for a request without your consent. No surprise charges. Ever.
            </p>
          </div>
          <div className="mt-10">
            <PricingTable settings={settings} />
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-[10px] border border-line bg-white p-6">
              <h3 className="text-[22px]">Why there are no refunds for requests</h3>
              <p className="mt-2 text-muted">
                Every request is exclusive and delivered in good faith, so requests are not refundable. This keeps both sides
                accountable. If a request is spam or fake, our team marks it invalid and it does not count toward your bill.
              </p>
            </div>
            <div className="rounded-[10px] border border-line bg-white p-6">
              <h3 className="text-[22px]">Our commitment to fairness</h3>
              <ul className="mt-2 space-y-1 text-muted">
                <li>No shared or auctioned requests</li>
                <li>No hidden fees and no forced overages</li>
                <li>One active request per client at a time</li>
                <li>Built-in safeguards against abuse</li>
              </ul>
            </div>
          </div>
        </Container>
      </section>

      {/* CTA */}
      <section className="border-t border-line bg-plaster-2 py-16 sm:py-20">
        <Container className="text-center">
          <h2 className="text-4xl sm:text-[44px]">Stand on fair ground.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted">
            Tired of bidding wars, unpredictable lead costs and unfair systems? FairGround offers a better way.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <LinkButton href="/signup?role=provider" size="lg">
              Join FairGround
            </LinkButton>
            <LinkButton href="/beta" variant="secondary" size="lg">
              Request beta access
            </LinkButton>
          </div>
          <p className="mt-6">
            <Link href="/fairness-policy" className="link">
              Read our fairness policy
            </Link>
          </p>
        </Container>
      </section>
    </>
  );
}
