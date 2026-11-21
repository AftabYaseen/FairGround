import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminCloseRequest, adminSetRequestInvalid } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LocalTime, SubmitButton } from "@/components/ui/client";
import { Input } from "@/components/ui/form";
import { requireRole } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { OUTCOME_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/request-codes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin: request" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-2.5 last:border-0 sm:grid-cols-[170px_1fr]">
      <dt className="text-sm font-semibold">{label}</dt>
      <dd className="min-w-0 break-words text-[15px]">{children}</dd>
    </div>
  );
}

export default async function AdminRequestPage(props: PageProps<"/admin/requests/[id]">) {
  const { id } = await props.params;
  await requireRole("admin", `/admin/requests/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("requests")
    .select("*, providers(business_name, slug), profiles!requests_client_id_fkey(full_name, email, status, violation_count, device_fingerprint)")
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();

  const [{ data: events }, { data: siblings }] = await Promise.all([
    supabase
      .from("request_events")
      .select("id, event, note, meta, created_at, profiles(full_name, role)")
      .eq("request_id", id)
      .order("created_at"),
    supabase
      .from("requests")
      .select("id, title, status, created_at, providers(business_name)")
      .eq("client_id", r.client_id)
      .neq("id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const client = r.profiles;
  const { data: billedOverage } = r.is_overage
    ? await supabase
        .from("invoices")
        .select("number")
        .eq("provider_id", r.provider_id)
        .eq("kind", "overage")
        .eq("period_month", r.billing_month)
        .eq("status", "paid")
        .maybeSingle()
    : { data: null };

  return (
    <div className="space-y-6">
      <Link href="/admin/requests" className="link text-sm">
        Back to requests
      </Link>
      <div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
          {r.is_overage ? <Badge tone="info">Extra request</Badge> : null}
          {r.is_invalid ? <Badge tone="danger">Invalid</Badge> : null}
        </div>
        <h1 className="mt-3 text-3xl">{r.title}</h1>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-[22px]">Lineage</h2>
            </CardHeader>
            <CardBody>
              <dl>
                <Row label="Entry path">
                  {r.entry_path === "link" ? "Provider's own link (link-locked)" : "Browsed the directory"}
                </Row>
                <Row label="Provider">
                  <Link href={`/p/${r.providers?.slug}?from=browse`} className="link">
                    {r.providers?.business_name}
                  </Link>
                </Row>
                <Row label="Client">
                  {client?.full_name} ({client?.email}){" "}
                  <Link href={`/admin/clients?q=${encodeURIComponent(client?.email ?? "")}`} className="link text-sm">
                    View client
                  </Link>
                  <div className="mt-1 text-sm text-muted">
                    Status {client?.status}, {client?.violation_count} violation(s)
                  </div>
                </Row>
                <Row label="Contact on request">
                  {r.contact_name}, {r.contact_email}, {formatPhone(r.contact_phone)}
                </Row>
                <Row label="Billing month">{r.billing_month}</Row>
                <Row label="IP">{r.ip ?? "Not recorded"}</Row>
                <Row label="Device fingerprint">
                  <code className="text-sm">{r.device_fingerprint ?? "Not recorded"}</code>
                  {client?.device_fingerprint && r.device_fingerprint && client.device_fingerprint !== r.device_fingerprint ? (
                    <div className="text-sm text-muted">Differs from sign-up device ({client.device_fingerprint})</div>
                  ) : null}
                </Row>
                <Row label="User agent">
                  <span className="text-sm text-muted">{r.user_agent ?? "Not recorded"}</span>
                </Row>
                <Row label="Job fingerprint">
                  <code className="text-sm">{r.fingerprint}</code>
                </Row>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[22px]">Job</h2>
            </CardHeader>
            <CardBody className="space-y-2">
              <p className="whitespace-pre-line">{r.description}</p>
              <p className="text-sm text-muted">
                ZIP {r.zip}
                {r.city ? `, ${r.city}` : ""} · {r.preferred_timing}
              </p>
              {r.outcome ? <p className="text-sm">Provider outcome: {OUTCOME_LABEL[r.outcome]}</p> : null}
              {r.client_outcome ? <p className="text-sm">Client outcome: {OUTCOME_LABEL[r.client_outcome]}</p> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[22px]">Events</h2>
            </CardHeader>
            <CardBody>
              <ol className="space-y-3 border-l-2 border-line pl-4 text-[15px]">
                {(events ?? []).map((ev) => (
                  <li key={ev.id}>
                    <span className="font-semibold">{ev.event}</span>{" "}
                    <span className="text-sm text-muted">
                      <LocalTime iso={ev.created_at} /> {ev.profiles ? `by ${ev.profiles.full_name} (${ev.profiles.role})` : "by system"}
                    </span>
                    {ev.note ? <p className="text-sm">{ev.note}</p> : null}
                    {ev.meta && Object.keys(ev.meta as object).length ? (
                      <code className="block text-xs text-muted">{JSON.stringify(ev.meta)}</code>
                    ) : null}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-[22px]">Actions</h2>
            </CardHeader>
            <CardBody className="space-y-6">
              {r.status === "active" ? (
                <form action={adminCloseRequest} className="space-y-2">
                  <input type="hidden" name="request_id" value={r.id} />
                  <Input name="note" placeholder="Reason (optional)" aria-label="Reason for closing" />
                  <SubmitButton variant="secondary" className="w-full" pendingText="Closing">
                    Close request
                  </SubmitButton>
                </form>
              ) : null}
              <form action={adminSetRequestInvalid} className="space-y-2">
                <input type="hidden" name="request_id" value={r.id} />
                <input type="hidden" name="invalid" value={r.is_invalid ? "false" : "true"} />
                {!r.is_invalid ? <Input name="reason" placeholder="Why it is spam or fake" aria-label="Reason" /> : null}
                <SubmitButton variant={r.is_invalid ? "secondary" : "danger"} className="w-full" pendingText="Saving">
                  {r.is_invalid ? "Mark as valid again" : "Mark invalid (not billed)"}
                </SubmitButton>
                <p className="text-sm text-muted">
                  Invalid requests do not count toward the provider&apos;s monthly allowance. A cap pause lifts if they are under
                  the cap again.
                </p>
                {r.is_invalid && r.invalid_reason ? <p className="text-sm">Reason: {r.invalid_reason}</p> : null}
                {r.is_overage && billedOverage ? (
                  <p className="text-sm font-medium text-danger">
                    This extra request was already billed on {billedOverage.number}. Marking it invalid does not refund it: issue a
                    credit or refund in Authorize.net if needed.
                  </p>
                ) : null}
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[22px]">Same client, other requests</h2>
            </CardHeader>
            <CardBody>
              {siblings?.length ? (
                <ul className="space-y-2 text-[15px]">
                  {siblings.map((s) => (
                    <li key={s.id}>
                      <Link href={`/admin/requests/${s.id}`} className="link">
                        {s.title}
                      </Link>
                      <div className="text-sm text-muted">
                        {s.providers?.business_name} · {STATUS_LABEL[s.status]} · <LocalTime iso={s.created_at} mode="date" />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">None.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
