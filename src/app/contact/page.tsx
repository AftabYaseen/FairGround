import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/marketing/prose-page";

export const metadata: Metadata = { title: "Contact" };

// TODO(Phase 7): add the OPAL support email address or a contact form once confirmed by the client.
export default function ContactPage() {
  return (
    <ProsePage title="Contact" intro="We are here to help providers and clients get a fair deal.">
      <p>
        FairGround is a resource from OPAL Quality Systems Management. A support address is coming soon. In the meantime, reply to any
        email you have received from FairGround and it will reach our team.
      </p>
      <p>
        Looking for answers? Try the <Link href="/faq" className="link">FAQ</Link> or the{" "}
        <Link href="/fairness-policy" className="link">fairness policy</Link>.
      </p>
    </ProsePage>
  );
}
