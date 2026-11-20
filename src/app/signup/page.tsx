import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { getSession } from "@/lib/auth";
import { postLoginPath } from "@/lib/post-login";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage(props: PageProps<"/signup">) {
  const session = await getSession();
  if (session?.profile) redirect(postLoginPath(session.profile));

  const { role } = await props.searchParams;
  const defaultRole = role === "provider" || role === "client" ? role : undefined;

  return (
    <AuthShell
      title="Join FairGround"
      description="One request. One provider. No bidding wars."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="link">
            Log in
          </Link>
        </>
      }
    >
      <SignupForm defaultRole={defaultRole} />
    </AuthShell>
  );
}
