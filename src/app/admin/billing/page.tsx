import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/ui/client";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { authnetEnv, isAuthnetConfigured } from "@/lib/authnet";
import { formatDateOnly, money } from "@/lib/format";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, SUBSCRIPTION_LABEL } from "@/lib/invoice-labels";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin: billing" };

export default async function AdminBillingPage() {
  await requireRole("admin", "/admin/billing");
  const supabase = await createClient();
  const [{ data: accounts }, { data: invoices }, { data: events }] = await Promise.all([
    supabase
      .from("billing_accounts")
      .select("provider_id, subscription_status, subscription_amount_cents, paid_through, card_brand, card_last4, last_failure_reason, last_failure_at, scheduled_change_on, providers(business_name, slug, billing_status, plan)")
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase.from("invoices").select("*, providers(business_name)").order("created_at", { ascending: false }).limit(50),
    supabase.from("billing_events").select("id, event_type, received_at, processed_at, error").order("received_at", { ascending: false }).limit(20),
  ]);

  const paidThisMonth = (invoices ?? [])
    .filter((i) => i.status === "paid" && i.paid_at && i.paid_at.slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((a, i) => a + i.amount_cents, 0);
  const outstanding = (invoices ?? []).filter((i) => i.status === "failed" || i.status === "pending");
  const active = (accounts ?? []).filter((a) => a.subscription_status === "active").length;
  const pastDue = (accounts ?? []).filter((a) => a.providers?.billing_status === "past_due").length;

  return (
    <div className="space-y-8">
      <PageHeader title="Billing" description={`Authorize.net ${authnetEnv()}. Recurring plans run on ARB; setup fees and extra requests are one-off charges.`} />
      {!isAuthnetConfigured() ? <Alert tone="warning" title="Authorize.net keys are not set">Billing pages show a notice and the billing cron is skipped.</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active subscriptions" value={active} />
        <Stat label="Past due" value={pastDue} />
        <Stat label="Collected this month" value={money(paidThisMonth)} hint="From the latest 50 invoices" />
        <Stat label="Unpaid invoices" value={outstanding.length} hint={money(outstanding.reduce((a, i) => a + i.amount_cents, 0))} />
      </div>

      <section>
        <h2 className="mb-3 text-xl">Accounts</h2>
        {accounts?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Provider</Th>
                <Th>Subscription</Th>
                <Th className="text-right">Monthly</Th>
                <Th>Paid through</Th>
                <Th>Card</Th>
                <Th>Last failure</Th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.provider_id}>
                  <Td>
                    <Link href={`/p/${a.providers?.slug}?from=browse`} className="link font-semibold">
                      {a.providers?.business_name}
                    </Link>
                    <p className="text-xs text-muted">
                      {a.providers?.plan} · billing {a.providers?.billing_status}
                    </p>
                  </Td>
                  <Td>
                    {a.subscription_status ? (
                      <Badge tone={SUBSCRIPTION_LABEL[a.subscription_status]?.tone ?? "neutral"}>{SUBSCRIPTION_LABEL[a.subscription_status]?.label ?? a.subscription_status}</Badge>
                    ) : (
                      <Badge tone="neutral">None</Badge>
                    )}
                    {a.scheduled_change_on ? <p className="mt-1 text-xs text-muted">Price change {formatDateOnly(a.scheduled_change_on)}</p> : null}
                  </Td>
                  <Td className="tabular text-right">{a.subscription_amount_cents != null ? money(a.subscription_amount_cents) : "None"}</Td>
                  <Td>{formatDateOnly(a.paid_through) ?? "Not yet"}</Td>
                  <Td className="tabular">{a.card_last4 ? `${a.card_brand ?? ""} ${a.card_last4}` : "None"}</Td>
                  <Td>
                    {a.last_failure_reason ? (
                      <>
                        <p className="text-sm">{a.last_failure_reason}</p>
                        <p className="text-xs text-muted">
                          <LocalTime iso={a.last_failure_at} />
                        </p>
                      </>
                    ) : (
                      "None"
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No billing accounts yet" />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl">Recent invoices</h2>
        {invoices?.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Provider</Th>
                <Th>Description</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Transaction</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <Td className="tabular">
                    {i.number}
                    <p className="text-xs text-muted">
                      <LocalTime iso={i.created_at} mode="date" />
                    </p>
                  </Td>
                  <Td>{i.providers?.business_name}</Td>
                  <Td>{i.description}</Td>
                  <Td className="tabular text-right">{money(i.amount_cents)}</Td>
                  <Td>
                    <Badge tone={INVOICE_STATUS_TONE[i.status]}>{INVOICE_STATUS_LABEL[i.status]}</Badge>
                    {i.failure_reason ? <p className="mt-1 text-xs text-muted">{i.failure_reason}</p> : null}
                  </Td>
                  <Td className="tabular text-sm">{i.authnet_transaction_id ?? "None"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No invoices yet" />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl">Webhook events</h2>
        {events?.length ? (
          <ul className="space-y-1 text-sm">
            {events.map((ev) => (
              <li key={ev.id} className="flex flex-wrap gap-2">
                <code>{ev.event_type}</code>
                <span className="text-muted">
                  <LocalTime iso={ev.received_at} />
                </span>
                {ev.error ? <Badge tone="danger">{ev.error.slice(0, 80)}</Badge> : ev.processed_at ? <Badge tone="success">Processed</Badge> : <Badge tone="warning">Pending</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No webhook events received yet.</p>
        )}
      </section>
    </div>
  );
}
