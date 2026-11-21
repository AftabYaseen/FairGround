import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/marketing/prose-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy policy" draft intro="This policy is a working draft and will be replaced after legal review.">
      <h2>What we collect</h2>
      <ul>
        <li>Account details: name, email address, phone number and password (stored securely by our authentication provider).</li>
        <li>Request details you choose to send, and the provider you send them to.</li>
        <li>Safety data: IP address, browser user agent and a device identifier, used to prevent fake accounts and abuse.</li>
      </ul>
      <h2>Who sees your details</h2>
      <p>
        A client&apos;s contact details are shared only with the one provider the request was sent to, and with FairGround staff. They
        are never shown publicly or sold.
      </p>
      <h2>Services we use</h2>
      <p>Supabase (database and sign-in), Vercel (hosting), Resend (email) and Twilio (phone verification).</p>
      <h2>Your choices</h2>
      <p>
        You can update your name and phone in your account. To delete your account or ask about your data, see{" "}
        <Link href="/contact" className="link">contact</Link>.
      </p>
    </ProsePage>
  );
}
