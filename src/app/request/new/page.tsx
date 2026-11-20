import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProviderLogo } from "@/components/provider/provider-logo";
import { FairnessAckForm } from "@/components/request/fairness-ack-form";
import { RequestForm } from "@/components/request/request-form";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { LocalTime } from "@/components/ui/client";
import { Container } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { LINK_LOCK_COOKIE } from "@/lib/link-lock";
import { getCategories, getPublicProviderBySlug } from "@/lib/providers";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Send a request" };

export default async function NewRequestPage(props: PageProps<"/request/new">) {
  const sp = await props.searchParams;
  const slug = typeof sp.provider === "string" ? sp.provider : "";
  const self = `/request/new?provider=${encodeURIComponent(slug)}`;
  const session = await requireRole("client", self);
  const { profile } = session;
  if (!profile.phone_verified_at) redirect(`/verify-phone?next=${encodeURIComponent(self)}`);
  if (!slug) redirect("/providers");

  const [found, categories, settings, cookieStore, supabase] = await Promise.all([
    getPublicProviderBySlug(slug),
    getCategories(),
    getSettings(),
    cookies(),
    createClient(),
  ]);
  if (!found) notFound();
  const { provider, categoryIds } = found;
  const lockedSlug = cookieStore.get(LINK_LOCK_COOKIE)?.value;
  const viaLink = lockedSlug === slug;

  const [{ data: active }, { data: ack }] = await Promise.all([
    supabase.from("requests").select("id").eq("client_id", session.userId).eq("status", "active").maybeSingle(),
    supabase
      .from("fairness_acknowledgements")
      .select("id")
      .eq("client_id", session.userId)
      .eq("statement_version", settings.fairness_statement_version)
      .limit(1)
      .maybeSingle(),
  ]);

  const locked = profile.status === "locked" && profile.locked_until && new Date(profile.locked_until) > new Date();

  let blocker: React.ReactNode = null;
  if (lockedSlug && lockedSlug !== slug) {
    blocker = (
      <Alert tone="warning" title="Your request stays with the provider whose link you used">
        <Link href={`/p/${lockedSlug}`} className="link">
          Go back to that provider
        </Link>
        .
      </Alert>
    );
  } else if (active) {
    blocker = (
      <Alert tone="warning" title="You already have an active request">
        FairGround allows one active request at a time, so providers are treated fairly.{" "}
        <Link href="/my-request" className="link">
          View or close your current request
        </Link>
        .
      </Alert>
    );
  } else if (profile.status === "suspended") {
    blocker = (
      <Alert tone="danger" title="Your account is suspended">
        You cannot send requests. <Link href="/contact" className="link">Contact us</Link> if you think this is a mistake.
      </Alert>
    );
  } else if (locked) {
    blocker = (
      <Alert tone="danger" title="Request submissions are locked">
        Because of repeated fairness violations, you can send requests again after <LocalTime iso={profile.locked_until} />.
      </Alert>
    );
  } else if (provider.requests_paused) {
    blocker = (
      <Alert tone="info" title={`${provider.business_name} is not accepting requests right now`}>
        Please check back later.
      </Alert>
    );
  }

  const providerCats = categories.filter((c) => categoryIds.includes(c.id));

  return (
    <Container className="max-w-3xl py-10 sm:py-14">
      <div className="mb-8 flex items-center gap-4">
        <ProviderLogo name={provider.business_name} url={provider.logo_url} size={56} />
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-muted">Request to</p>
          <h1 className="text-3xl sm:text-4xl">{provider.business_name}</h1>
        </div>
      </div>

      {!viaLink && !blocker ? (
        <div className="mb-6 flex items-start gap-3 rounded-[6px] border-l-4 border-safety bg-white px-4 py-3">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p className="font-medium">
            You may submit one active request to one provider at a time. Please review profiles carefully.
          </p>
        </div>
      ) : null}

      {profile.status === "warned" && !blocker ? (
        <Alert tone="warning" title="Your account has a warning" className="mb-6">
          A fairness rule was broken on your account. Another violation will lock request submissions for 7 days.
        </Alert>
      ) : null}

      {blocker ? (
        <div className="space-y-6">
          {blocker}
          <LinkButton href={viaLink || lockedSlug ? `/p/${lockedSlug ?? slug}` : "/my-request"} variant="secondary">
            Go back
          </LinkButton>
        </div>
      ) : !ack ? (
        <FairnessAckForm statement={settings.fairness_statement} />
      ) : providerCats.length === 0 ? (
        <Alert tone="info">This provider has not finished setting up their services yet. Please check back later.</Alert>
      ) : (
        <Card>
          <CardBody>
            <RequestForm
              providerSlug={provider.slug}
              providerName={provider.business_name}
              categories={providerCats}
              contactName={profile.full_name}
              contactEmail={session.email ?? profile.email}
              contactPhone={formatPhone(profile.phone)}
            />
          </CardBody>
        </Card>
      )}
    </Container>
  );
}
