import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { Alert } from "@/components/ui/alert";
import { getSession } from "@/lib/auth";
import { postLoginPath } from "@/lib/post-login";
import { safeNext } from "@/lib/roles";

export const metadata: Metadata = { title: "Log in" };

const MESSAGES: Record<string, { tone: "success" | "danger" | "info"; text: string }> = {
  confirmed: { tone: "success", text: "Your email is confirmed. Log in to continue." },
  link: { tone: "danger", text: "That link has expired or was already used. Log in, or request a new link." },
};

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next, "") : "";
  const session = await getSession();
  if (session?.profile) redirect(next || postLoginPath(session.profile));

  const notice = typeof sp.notice === "string" ? MESSAGES[sp.notice] : undefined;

  return (
    <AuthShell
      title="Log in"
      footer={
        <>
          New to FairGround?{" "}
          <Link href="/signup" className="link">
            Create an account
          </Link>
        </>
      }
    >
      {notice ? (
        <Alert tone={notice.tone} className="mb-5">
          {notice.text}
        </Alert>
      ) : null}
      <LoginForm next={next || undefined} />
    </AuthShell>
  );
}
