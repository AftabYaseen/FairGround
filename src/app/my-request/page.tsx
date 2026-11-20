import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { clearLinkLock, reportOutcome } from "@/app/actions/request";
import { CloseRequestForm } from "@/components/request/close-request-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LocalTime } from "@/components/ui/client";
import { Container, EmptyState, PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { LINK_LOCK_COOKIE } from "@/lib/link-lock";
import { getCategories } from "@/lib/providers";
import { OUTCOME_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/request-codes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My request" };

const EVENT_LABEL: Record<string, string> = {
  created: "Request sent",
  viewed: "Provider opened your request",
  responded: "Provider responded",
  declined: "Provider declined",
  completed: "Marked completed",
  closed: "Closed",
  expired: "Expired",
  admin_action: "Updated by FairGround",
};

export default async function MyRequestPage(props: PageProps<"/my-request">) {
  const session = await requireRole("client", "/my-request");
  const { profile } = session;
  const sp = await props.searchParams;
  const supabase = await createClient();
  const [{ data: requests, error }, categories, cookieStore] = await Promise.all([
    supabase
      .from("requests")
      .select(
        "id, title, description, status, zip, city, preferred_timing, created_at, expires_at, closed_at, client_outcome, outcome, entry_path, category_id, provider_id, providers(business_name, slug)",
      )
      .eq("client_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(50),
    getCategories(),
    cookies(),
  ]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const active = requests?.find((r) => r.status === "active") ?? null;
  const history = (requests ?? []).filter((r) => r.status !== "active");
  const lockedSlug = cookieStore.get(LINK_LOCK_COOKIE)?.value;

  const { data: events } = active
    ? await supabase.from("request_events").select("id, event, created_at, meta").eq("request_id", active.id).order("created_at")
    : { data: [] };

  const locked = profile.status === "locked" && profile.locked_until && new Date(profile.locked_until) > new Date();

  return (
    <Container className="max-w-4xl py-10 sm:py-14">
      <PageHeader title="My request" description="You can have one active request at a time, with one provider." />

      {!profile.phone_verified_at ? (
        <Alert tone="warning" title="Verify your phone to send requests" className="mb-6">
          <Link href="/verify-phone?next=/my-request" className="link">
            Verify now
          </Link>
        </Alert>
      ) : null}
      {profile.status === "warned" ? (
        <Alert tone="warning" title="Your account has a warning" className="mb-6">
          A fairness rule was broken on your account. Another violation will lock request submissions for 7 days.
        </Alert>
      ) : null}
      {locked ? (
        <Alert tone="danger" title="Request submissions are locked" className="mb-6">
          You can send requests again after <LocalTime iso={profile.locked_until} />.
        </Alert>
      ) : null}
      {profile.status === "suspended" ? (
        <Alert tone="danger" title="Your account is suspended" className="mb-6">
          <Link href="/contact" className="link">
            Contact us
          </Link>{" "}
          if you think this is a mistake.
        </Alert>
      ) : null}
      {sp.sent ? (
        <Alert tone="success" title="Your request was sent" className="mb-6">
          It went to one provider only. They will contact you directly. We have emailed you a confirmation.
        </Alert>
      ) : null}
      {error ? <Alert tone="danger" className="mb-6">We could not load your requests. Please refresh the page.</Alert> : null}

      {active ? (
        <Card className="overflow-hidden">
          <div aria-hidden className="safety-stripe h-2" />
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Badge tone={STATUS_TONE.active}>Active</Badge>
              <h2 className="mt-2 text-2xl">{active.title}</h2>
              <p className="mt-1 text-muted">
                To{" "}
                <Link href={`/p/${active.providers?.slug}`} className="link">
                  {active.providers?.business_name}
                </Link>{" "}
                · {catName.get(active.category_id)}
              </p>
            </div>
            <dl className="text-right text-sm">
              <dt className="text-muted">Sent</dt>
              <dd className="font-medium">
                <LocalTime iso={active.created_at} />
              </dd>
              <dt className="mt-1 text-muted">Expires if not closed</dt>
              <dd className="font-medium">
                <LocalTime iso={active.expires_at} />
              </dd>
            </dl>
          </CardHeader>
          <CardBody className="space-y-6">
            <p className="whitespace-pre-line">{active.description}</p>
            <p className="text-sm text-muted">
              ZIP {active.zip}
              {active.city ? `, ${active.city}` : ""} · {active.preferred_timing}
            </p>
            {events && events.length ? (
              <div>
                <h3 className="text-lg">Activity</h3>
                <ol className="mt-3 space-y-2 border-l-2 border-line pl-4">
                  {events.map((ev) => (
                    <li key={ev.id} className="text-[15px]">
                      <span className="font-medium">{EVENT_LABEL[ev.event] ?? ev.event}</span>{" "}
                      <span className="text-muted">
                        <LocalTime iso={ev.created_at} />
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            <CloseRequestForm requestId={active.id} />
          </CardBody>
        </Card>
      ) : (
        <EmptyState
          title="You do not have an active request"
          action={
            lockedSlug ? (
              <div className="flex flex-wrap justify-center gap-3">
                <LinkButton href={`/p/${lockedSlug}`}>Continue with your provider</LinkButton>
                {history.length ? (
                  <form action={clearLinkLock}>
                    <button type="submit" className={buttonClass("secondary")}>
                      Find a different provider
                    </button>
                  </form>
                ) : null}
              </div>
            ) : (
              <LinkButton href="/providers">Find a provider</LinkButton>
            )
          }
        >
          When you are ready, choose one provider and send them your request.
        </EmptyState>
      )}

      <section id="history" className="mt-12 scroll-mt-24">
        <h2 className="text-2xl">Past requests</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-muted">No past requests yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {history.map((r) => (
              <li key={r.id} className="rounded-[10px] border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.title}</p>
                    <p className="text-sm text-muted">
                      {r.providers?.business_name} · <LocalTime iso={r.created_at} mode="date" />
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </div>
                {r.client_outcome ? (
                  <p className="mt-3 flex items-center gap-2 text-sm">
                    <CheckCircle2 aria-hidden className="size-4 text-success" />
                    You told us: {OUTCOME_LABEL[r.client_outcome]}
                  </p>
                ) : (
                  <form action={reportOutcome} className="mt-4 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="request_id" value={r.id} />
                    <span className="mr-1 text-sm font-semibold">Did you hire them?</span>
                    <button name="outcome" value="hired" className={buttonClass("secondary", "sm")}>
                      Yes
                    </button>
                    <button name="outcome" value="not_hired" className={buttonClass("secondary", "sm")}>
                      No
                    </button>
                    <button name="outcome" value="no_response" className={buttonClass("ghost", "sm")}>
                      They did not respond
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
