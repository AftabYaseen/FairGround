import { Clock, Globe, MapPin, Phone, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvailabilityBadge } from "@/components/provider/availability-badge";
import { ProviderLogo } from "@/components/provider/provider-logo";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Container } from "@/components/ui/misc";
import { getSession } from "@/lib/auth";
import { hoursLabel } from "@/lib/format";
import { LINK_LOCK_COOKIE } from "@/lib/link-lock";
import { getCategories, getPublicProviderBySlug } from "@/lib/providers";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(props: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const found = await getPublicProviderBySlug(slug);
  if (!found) return { title: "Provider not found" };
  const { provider } = found;
  return {
    title: provider.business_name,
    description: provider.tagline ?? `Send a request to ${provider.business_name} on FairGround. One request, one provider.`,
  };
}

export default async function ProviderPage(props: PageProps<"/p/[slug]">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const [found, categories, session, cookieStore] = await Promise.all([
    getPublicProviderBySlug(slug),
    getCategories(),
    getSession(),
    cookies(),
  ]);
  if (!found) notFound();
  const { provider, categoryIds } = found;

  const role = session?.profile?.role;
  const lockedSlug = cookieStore.get(LINK_LOCK_COOKIE)?.value;
  const fromBrowse = sp.from === "browse";
  // Arriving through the provider's own link: no browse links anywhere on the page.
  const linkLocked = !fromBrowse || lockedSlug === slug;
  const lockedElsewhere = Boolean(lockedSlug) && lockedSlug !== slug && role !== "provider" && role !== "admin";

  let activeRequest: { id: string } | null = null;
  if (role === "client" && session) {
    const supabase = await createClient();
    const { data } = await supabase.from("requests").select("id").eq("client_id", session.userId).eq("status", "active").maybeSingle();
    activeRequest = data;
  }

  const providerCats = categories.filter((c) => categoryIds.includes(c.id));
  const isOwner = role === "provider" && session?.profile?.id && (await isOwnProvider(session.userId, provider.id));
  const entry = linkLocked ? "link" : "browse";
  const requestHref = `/request/new?provider=${provider.slug}&via=${entry}`;

  return (
    <>
      <section className="border-b border-line bg-white">
        <Container className="py-10 sm:py-14">
          {!linkLocked && !lockedSlug ? (
            <Link href="/providers" className="link text-sm">
              Back to the directory
            </Link>
          ) : null}
          <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
            <ProviderLogo name={provider.business_name} url={provider.logo_url} size={96} />
            <div className="min-w-0 flex-1 space-y-3">
              <AvailabilityBadge paused={provider.requests_paused} />
              <h1 className="text-4xl sm:text-5xl">{provider.business_name}</h1>
              {provider.tagline ? <p className="text-lg text-muted">{provider.tagline}</p> : null}
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-muted">
                {provider.city ? (
                  <li className="flex items-center gap-1.5">
                    <MapPin aria-hidden className="size-4" />
                    {provider.city}
                    {provider.state ? `, ${provider.state}` : ""}
                  </li>
                ) : null}
                {provider.years_in_business != null ? (
                  <li className="tabular">{provider.years_in_business} years in business</li>
                ) : null}
                <li className="flex items-center gap-1.5">
                  <Clock aria-hidden className="size-4" />
                  Typical response: {hoursLabel(provider.avg_response_hours)}
                </li>
              </ul>
            </div>
          </div>
        </Container>
      </section>

      <Container className="grid gap-8 py-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          {provider.description ? (
            <section>
              <h2 className="text-2xl">About</h2>
              <p className="mt-3 whitespace-pre-line">{provider.description}</p>
            </section>
          ) : null}
          {providerCats.length ? (
            <section>
              <h2 className="text-2xl">Services</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {providerCats.map((c) => (
                  <li key={c.id} className="rounded-[6px] border border-line bg-white px-3 py-1.5 text-[15px] font-medium">
                    {c.name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {provider.typical_jobs ? (
            <section>
              <h2 className="text-2xl">Typical jobs</h2>
              <p className="mt-3 whitespace-pre-line">{provider.typical_jobs}</p>
            </section>
          ) : null}
          {provider.service_zips.length ? (
            <section>
              <h2 className="text-2xl">Service area</h2>
              <p className="tabular mt-3 text-muted">{provider.service_zips.join(", ")}</p>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardBody className="space-y-4">
              <h2 className="text-[22px]">Send a request</h2>
              {isOwner ? (
                <Alert tone="info">This is your public page. Clients send requests from here.</Alert>
              ) : role === "provider" || role === "admin" ? (
                <Alert tone="info">Only client accounts can send requests.</Alert>
              ) : activeRequest ? (
                <Alert tone="warning" title="You already have an active request">
                  FairGround allows one active request at a time. <Link href="/my-request" className="link">View your request</Link>.
                </Alert>
              ) : lockedElsewhere ? (
                <Alert tone="warning" title="You came to FairGround through another provider's link">
                  Your request stays with that provider. <Link href={`/p/${lockedSlug}`} className="link">Go back to them</Link>.
                </Alert>
              ) : provider.requests_paused ? (
                <Alert tone="info" title="Not accepting requests right now">
                  This provider has paused new requests. Please check back later.
                </Alert>
              ) : (
                <>
                  <p className="text-[15px] text-muted">
                    Your request goes to {provider.business_name} only. It is never shared or auctioned.
                  </p>
                  <LinkButton href={requestHref} size="lg" className="w-full">
                    Request service
                  </LinkButton>
                </>
              )}
              <p className="flex gap-2 border-t border-line pt-4 text-sm text-muted">
                <ShieldCheck aria-hidden className="size-4 shrink-0 text-success" />
                You may submit one active request to one provider at a time.
              </p>
            </CardBody>
          </Card>
          {provider.phone_public || provider.website ? (
            <Card>
              <CardBody className="space-y-2 text-[15px]">
                {provider.phone_public ? (
                  <p className="flex items-center gap-2">
                    <Phone aria-hidden className="size-4 text-muted" />
                    <a href={`tel:${provider.phone_public}`} className="link">
                      {provider.phone_public}
                    </a>
                  </p>
                ) : null}
                {provider.website ? (
                  <p className="flex items-center gap-2">
                    <Globe aria-hidden className="size-4 text-muted" />
                    <a href={provider.website} className="link break-all" target="_blank" rel="noopener noreferrer nofollow">
                      {provider.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  </p>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
        </aside>
      </Container>
    </>
  );
}

async function isOwnProvider(userId: string, providerId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("providers").select("id").eq("profile_id", userId).maybeSingle();
  return data?.id === providerId;
}
