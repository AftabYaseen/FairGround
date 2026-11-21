import { Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { markRequestResponded } from "@/app/actions/inbox";
import { RequestActions } from "@/components/provider/request-actions";
import { ViewTracker } from "@/components/provider/view-tracker";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LocalTime, SubmitButton } from "@/components/ui/client";
import { formatPhone } from "@/lib/format";
import { requireProvider } from "@/lib/provider-session";
import { getCategories } from "@/lib/providers";
import { OUTCOME_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/request-codes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Request" };

const EVENT_LABEL: Record<string, string> = {
  created: "Request received",
  viewed: "You opened it",
  responded: "You marked it responded",
  declined: "Declined",
  completed: "Completed",
  closed: "Closed",
  expired: "Expired",
  admin_action: "FairGround update",
};

export default async function ProviderRequestPage(props: PageProps<"/dashboard/requests/[id]">) {
  const { id } = await props.params;
  const { provider } = await requireProvider(`/dashboard/requests/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: r }, categories] = await Promise.all([
    supabase.from("requests").select("*").eq("id", id).eq("provider_id", provider.id).maybeSingle(),
    getCategories(),
  ]);
  if (!r) notFound();
  const { data: events } = await supabase.from("request_events").select("id, event, created_at, note, meta").eq("request_id", r.id).order("created_at");
  const category = categories.find((c) => c.id === r.category_id)?.name;
  const active = r.status === "active";

  return (
    <div className="space-y-6">
      <ViewTracker requestId={r.id} />
      <Link href="/dashboard/requests" className="link text-sm">
        Back to requests
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
            {r.is_overage ? <Badge tone="info">Extra request</Badge> : null}
            {r.is_invalid ? <Badge tone="danger">Marked invalid, not billed</Badge> : null}
          </div>
          <h1 className="mt-3 text-3xl sm:text-4xl">{r.title}</h1>
          <p className="mt-1 text-muted">
            {category} · Received <LocalTime iso={r.created_at} /> · via {r.entry_path === "link" ? "your link" : "the directory"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-[22px]">Job details</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="whitespace-pre-line">{r.description}</p>
              <dl className="grid gap-3 text-[15px] sm:grid-cols-3">
                <div>
                  <dt className="font-semibold">Location</dt>
                  <dd className="text-muted">
                    {r.city ? `${r.city}, ` : ""}
                    {r.zip}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">Timing</dt>
                  <dd className="text-muted">{r.preferred_timing ?? "Not given"}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Expires</dt>
                  <dd className="text-muted">
                    <LocalTime iso={r.expires_at} />
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[22px]">{active ? "Update this request" : "Outcome"}</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              {active ? (
                <>
                  {!r.responded_at ? (
                    <form action={markRequestResponded} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="request_id" value={r.id} />
                      <SubmitButton variant="steel" pendingText="Saving">
                        I have contacted the client
                      </SubmitButton>
                      <span className="text-sm text-muted">Helps clients see your typical response time.</span>
                    </form>
                  ) : (
                    <p className="text-[15px] text-success">
                      Responded <LocalTime iso={r.responded_at} />
                    </p>
                  )}
                  <RequestActions requestId={r.id} />
                </>
              ) : (
                <div className="space-y-2 text-[15px]">
                  <p>
                    {STATUS_LABEL[r.status]} <LocalTime iso={r.closed_at} />
                  </p>
                  {r.outcome ? <p>Outcome: {OUTCOME_LABEL[r.outcome]}</p> : null}
                  {r.outcome_note ? <p className="text-muted">Note: {r.outcome_note}</p> : null}
                  {r.client_outcome ? <p>Client says: {OUTCOME_LABEL[r.client_outcome]}</p> : null}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-[22px]">Client</h2>
            </CardHeader>
            <CardBody className="space-y-3 text-[15px]">
              <p className="font-semibold">{r.contact_name}</p>
              <p className="flex items-center gap-2 break-all">
                <Mail aria-hidden className="size-4 shrink-0 text-muted" />
                <a href={`mailto:${r.contact_email}`} className="link">
                  {r.contact_email}
                </a>
              </p>
              <p className="flex items-center gap-2">
                <Phone aria-hidden className="size-4 shrink-0 text-muted" />
                <a href={`tel:${r.contact_phone}`} className="link tabular">
                  {formatPhone(r.contact_phone)}
                </a>
              </p>
              <p className="border-t border-line pt-3 text-sm text-muted">Email and phone are verified. Shared with you only.</p>
            </CardBody>
          </Card>
          {active ? (
            <Alert tone="info" title="Can't do all of it?">
              Partner with another provider rather than sending the client away. FairGround is built on collaboration.
            </Alert>
          ) : null}
          <Card>
            <CardHeader>
              <h2 className="text-[22px]">Activity</h2>
            </CardHeader>
            <CardBody>
              <ol className="space-y-2 border-l-2 border-line pl-4 text-[15px]">
                {(events ?? []).map((ev) => (
                  <li key={ev.id}>
                    <span className="font-medium">{EVENT_LABEL[ev.event] ?? ev.event}</span>{" "}
                    <span className="text-sm text-muted">
                      <LocalTime iso={ev.created_at} />
                    </span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
