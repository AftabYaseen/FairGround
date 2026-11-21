import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/marketing/prose-page";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <ProsePage title="Terms of service" draft intro="These terms are a working draft and will be replaced after legal review.">
      <h2>The service</h2>
      <p>
        FairGround is a service request platform run by OPAL Quality Systems Management. It connects clients with one service
        provider at a time. FairGround is not a party to any agreement between a client and a provider.
      </p>
      <h2>Accounts</h2>
      <p>You must give accurate information, verify your email and phone, and keep one account per person or business.</p>
      <h2>Fair use</h2>
      <p>
        You agree to follow the <Link href="/fairness-policy" className="link">fairness policy</Link>. Breaking it can lead to warnings,
        temporary locks or suspension.
      </p>
      <h2>Provider plans</h2>
      <p>
        Plans are month to month. Requests are delivered in good faith and are not refundable. Requests our team marks invalid do not
        count toward your bill. FairGround never charges for extra requests unless you opt in.
      </p>
      <h2>Contact</h2>
      <p>
        Questions about these terms: see <Link href="/contact" className="link">contact</Link>.
      </p>
    </ProsePage>
  );
}
