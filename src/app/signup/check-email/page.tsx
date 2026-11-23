import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResendConfirmationForm } from "@/components/auth/simple-forms";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage(props: PageProps<"/signup/check-email">) {
  const { email } = await props.searchParams;
  const address = typeof email === "string" ? email : "";

  return (
    <AuthShell
      title="Check your email"
      footer={
        <Link href="/login" className="link">
          Back to log in
        </Link>
      }
    >
      <div className="space-y-5">
        <MailCheck aria-hidden className="size-10 text-steel" />
        <p>
          We sent a confirmation link to <strong className="break-all">{address || "your email address"}</strong>. Open it to
          confirm your account. Clients then verify their phone by text message.
        </p>
        <p className="text-sm text-muted">The link works once. Check your spam folder if it does not arrive in a few minutes.</p>
        {address ? <ResendConfirmationForm email={address} /> : null}
      </div>
    </AuthShell>
  );
}
