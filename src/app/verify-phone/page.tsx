import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { PhoneVerifyForm } from "@/components/auth/phone-form";
import { requireRole } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { postLoginPath } from "@/lib/post-login";
import { safeNext } from "@/lib/roles";
import { phoneBypassAllowed } from "@/lib/twilio";

export const metadata: Metadata = { title: "Verify your phone" };

export default async function VerifyPhonePage(props: PageProps<"/verify-phone">) {
  const { profile } = await requireRole(["client", "provider", "admin"], "/verify-phone");
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next, "") : "";
  const change = sp.change === "1";

  if (profile.phone_verified_at && !change) {
    redirect(next || postLoginPath(profile));
  }

  return (
    <AuthShell
      title={change ? "Change your phone" : "Verify your phone"}
      description="Every request on FairGround comes from a verified person. We will text you a short code."
    >
      <PhoneVerifyForm phone={formatPhone(profile.phone)} next={next || undefined} devBypass={phoneBypassAllowed()} />
    </AuthShell>
  );
}
