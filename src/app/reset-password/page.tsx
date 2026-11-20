import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/simple-forms";
import { Alert } from "@/components/ui/alert";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const session = await getSession();
  return (
    <AuthShell title="Choose a new password">
      {session ? (
        <ResetPasswordForm />
      ) : (
        <Alert tone="danger" title="This reset link has expired">
          Please{" "}
          <Link href="/forgot-password" className="link">
            request a new link
          </Link>
          .
        </Alert>
      )}
    </AuthShell>
  );
}
