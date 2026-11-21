import type { Metadata } from "next";
import { ProsePage } from "@/components/marketing/prose-page";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Fairness policy" };

export default async function FairnessPolicyPage() {
  const s = await getSettings();
  return (
    <ProsePage title="Fairness policy" draft intro="FairGround does not allow multi-provider bidding for the same job. This is designed into the system, not just asked of you.">
      <blockquote className="border-l-4 border-safety bg-white p-5 text-lg">{s.fairness_statement}</blockquote>

      <h2>One active request, one provider</h2>
      <p>
        A client can have one active request on the whole platform at a time. A request stays active until the provider declines,
        completes or closes it, the client closes it, FairGround closes it, or it expires after {s.request_expiry_days} days.
      </p>

      <h2>Provider links are exclusive</h2>
      <p>
        If you arrive through a provider&apos;s own FairGround link, your request goes to that provider and you will not be shown
        other providers until the request is resolved.
      </p>

      <h2>No shopping the same job around</h2>
      <p>
        If you close a request and send a very similar job for the same service and ZIP code to someone else within 72 hours, it is
        blocked and recorded as a violation. If the provider declined, closed or did not respond to your request, you may take the
        job to another provider.
      </p>

      <h2>What happens if the rules are broken</h2>
      <ul>
        <li>First violation: a warning on your account.</li>
        <li>Second violation: you cannot send requests for 7 days.</li>
        <li>Third violation: your account is suspended.</li>
      </ul>
      <p>Our team reviews flagged accounts and can restore access when it is fair to do so.</p>

      <h2>Verified requests only</h2>
      <p>
        Every request includes a verified email address and phone number. We limit sign-ups and requests by network, phone number and
        device to stop fake accounts.
      </p>

      <h2>Our promise to providers</h2>
      <p>
        Every request you receive is exclusive. We do not allow bidding wars, shared requests or multi-provider shopping. FairGround
        never charges for a request without your consent. Requests are not refundable, but spam or fake requests that our team marks
        invalid do not count toward your bill.
      </p>
    </ProsePage>
  );
}
