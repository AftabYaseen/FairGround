import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { NameForm } from "@/components/account/name-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LocalTime } from "@/components/ui/client";
import { Container, PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { formatPhone } from "@/lib/format";

export const metadata: Metadata = { title: "Your account" };

const ROLE_LABEL = { admin: "Admin", provider: "Service provider", client: "Client" } as const;

export default async function AccountPage() {
  const { profile, email } = await requireRole(["client", "provider", "admin"], "/account");

  return (
    <Container className="max-w-3xl py-10 sm:py-14">
      <PageHeader title="Your account" eyebrow={ROLE_LABEL[profile.role]} />

      {profile.status === "warned" ? (
        <Alert tone="warning" title="Your account has a warning" className="mb-6">
          A fairness rule was broken on your account. Another violation will lock request submissions for 7 days.
        </Alert>
      ) : null}
      {profile.status === "locked" ? (
        <Alert tone="danger" title="Request submissions are locked" className="mb-6">
          You can submit requests again after <LocalTime iso={profile.locked_until} />.
        </Alert>
      ) : null}
      {profile.status === "suspended" ? (
        <Alert tone="danger" title="Your account is suspended" className="mb-6">
          Please <Link href="/contact" className="link">contact us</Link> if you think this is a mistake.
        </Alert>
      ) : null}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <h2 className="text-[22px]">Profile</h2>
          </CardHeader>
          <CardBody className="space-y-6">
            <NameForm fullName={profile.full_name} />
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-semibold">Email</dt>
                <dd className="mt-1 break-all text-muted">{email ?? profile.email}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold">Phone</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 text-muted">
                  <span className="tabular">{formatPhone(profile.phone) || "Not set"}</span>
                  {profile.phone_verified_at ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}
                </dd>
                <dd className="mt-2">
                  <Link href={profile.phone_verified_at ? "/verify-phone?change=1" : "/verify-phone"} className="link text-sm">
                    {profile.phone_verified_at ? "Change phone number" : "Verify now"}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold">Member since</dt>
                <dd className="mt-1 text-muted">
                  <LocalTime iso={profile.created_at} mode="date" />
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-[22px]">Security</h2>
          </CardHeader>
          <CardBody className="flex flex-wrap gap-3">
            <Link href="/forgot-password" className={buttonClass("secondary")}>
              Change password
            </Link>
            <form action={signOut}>
              <button type="submit" className={buttonClass("ghost")}>
                Log out
              </button>
            </form>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
