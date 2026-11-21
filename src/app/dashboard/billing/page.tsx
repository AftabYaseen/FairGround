import type { Metadata } from "next";
import Link from "next/link";
import { startBilling, updateBillingCard } from "@/app/actions/billing";
import { AcceptCardForm } from "@/components/billing/accept-card-form";
import { CancelSubscriptionForm } from "@/components/billing/cancel-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LocalTime } from "@/components/ui/client";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { authnetEnv, isAuthnetConfigured } from "@/lib/authnet";
import { consentText } from "@/lib/billing-consent";
import { formatDateOnly, money } from "@/lib/format";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, SUBSCRIPTION_LABEL } from "@/lib/invoice-labels";
import { requireProvider } from "@/lib/provider-session";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const { provider } = await requireProvider("/dashboard/billing");
  const supabase = await createClient();
  const [settings, { data: account }, { data: invoices }] = await Promise.all([
    getSettings(),
    supabase
      .from("billing_accounts")
      .select("subscription_status, subscription_amount_cents, subscription_started_on, paid_through, card_brand, card_last4, card_exp, scheduled_amount_cents, scheduled_change_on, canceled_at, last_failure_reason, last_failure_at")
      .eq("provider_id", provider.id)
      .maybeSingle(),
    supabase.from("invoices").select("*").eq("provider_id", provider.id).order("created_at", { ascending: false }).limit(60),
  ]);

  const beta = provider.plan === "beta";
  const monthly = beta ? settings.beta_monthly_cents : settings.std_monthly_cents;
  const setup = beta ? settings.beta_setup_cents : settings.std_setup_cents;
  const overage = beta ? settings.beta_overage_cents : settings.std_overage_cents;
  const setupPaid = (invoices ?? []).some((i) => i.kind === "setup_fee" && i.status === "paid");
  const due = (invoices ?? []).filter((i) => i.status === "pending" || i.status === "failed");
  const dueTotal = due.reduce((a, i) => a + i.amount_cents, 0);
  const hasSub = account?.subscription_status === "active" || account?.subscription_status === "suspended";
  const configured = isAuthnetConfigured();
  const env = authnetEnv();
  const apiLoginId = process.env.NEXT_PUBLIC_AUTHNET_API_LOGIN_ID ?? "";
  const clientKey = process.env.NEXT_PUBLIC_AUTHNET_CLIENT_KEY ?? "";
  const status = account?.subscription_status ? SUBSCRIPTION_LABEL[account.subscription_status] : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="Flat monthly pricing. FairGround never charges for a request without your consent." />

      {configured && env === "sandbox" ? (
        <Alert tone="info" title="Test mode">
          Payments use the Authorize.net sandbox. Use a test card such as 4111 1111 1111 1111 with any future expiry. No real money moves.
        </Alert>
      ) : null}
      {!configured ? (
        <Alert tone="warning" title="Billing is not available yet">
          Online payments are being set up. You can keep using FairGround in the meantime.
        </Alert>
      ) : null}
      {provider.billing_status === "past_due" ? (
        <Alert tone="danger" title="Your last payment did not go through">
          New requests are paused until your billing is up to date. {account?.last_failure_reason ? `Reason: ${account.last_failure_reason}.` : ""} Update your card below and we will retry straight away.
        </Alert>
      ) : null}
      {account?.scheduled_amount_cents != null && account.scheduled_change_on ? (
        <Alert tone="info" title="Price change scheduled">
          Your founding price lock ends. From {formatDateOnly(account.scheduled_change_on)}, your plan is {money(account.scheduled_amount_cents)} a month.
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[22px]">Your plan</h2>
          {status ? <Badge tone={status.tone}>{status.label}</Badge> : <Badge tone="neutral">Not started</Badge>}
        </CardHeader>
        <CardBody className="grid gap-5 text-[15px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-semibold">Plan</p>
            <p className="text-muted">{beta ? "Founding member" : "Standard"}</p>
          </div>
          <div>
            <p className="font-semibold">Monthly</p>
            <p className="tabular text-muted">
              {money(account?.subscription_amount_cents ?? monthly)} for {provider.monthly_cap} requests
            </p>
          </div>
          <div>
            <p className="font-semibold">Extra requests</p>
            <p className="tabular text-muted">
              {money(overage)} each, {provider.overage_opt_in ? "turned on" : "turned off"}
            </p>
          </div>
          <div>
            <p className="font-semibold">{account?.subscription_status === "canceled" ? "Requests until" : "Paid through"}</p>
            <p className="text-muted">{formatDateOnly(account?.paid_through) ?? (hasSub ? "First charge processing" : "Not yet")}</p>
          </div>
          {beta && provider.plan_price_locked_until ? (
            <div>
              <p className="font-semibold">Price locked until</p>
              <p className="text-muted">{formatDateOnly(provider.plan_price_locked_until)}</p>
            </div>
          ) : null}
          {account?.card_last4 ? (
            <div>
              <p className="font-semibold">Card on file</p>
              <p className="tabular text-muted">
                {account.card_brand ?? "Card"} ending {account.card_last4}
                {account.card_exp ? `, expires ${account.card_exp}` : ""}
              </p>
            </div>
          ) : null}
          {dueTotal > 0 ? (
            <div>
              <p className="font-semibold">Amount due</p>
              <p className="tabular font-semibold text-danger">{money(dueTotal)}</p>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {configured ? (
        hasSub ? (
          <>
            <Card>
              <CardHeader>
                <h2 className="text-[22px]">Update card</h2>
              </CardHeader>
              <CardBody>
                <AcceptCardForm action={updateBillingCard} submitLabel={dueTotal > 0 ? `Save card and pay ${money(dueTotal)}` : "Save new card"} apiLoginId={apiLoginId} clientKey={clientKey} env={env} />
              </CardBody>
            </Card>
            <div className="flex justify-end">
              <CancelSubscriptionForm paidThrough={formatDateOnly(account?.paid_through)} />
            </div>
          </>
        ) : (
          <Card>
            <CardHeader>
              <h2 className="text-[22px]">{account?.subscription_status ? "Restart your subscription" : "Start your subscription"}</h2>
            </CardHeader>
            <CardBody className="space-y-5">
              <ul className="space-y-1 text-[15px]">
                <li className="tabular">
                  <strong>{money(monthly)}</strong> a month, first charge processed overnight, then monthly
                </li>
                {setup > 0 && !setupPaid ? (
                  <li className="tabular">
                    <strong>{money(setup)}</strong> one-time setup fee, charged today
                  </li>
                ) : null}
                {dueTotal > 0 ? (
                  <li className="tabular">
                    <strong>{money(dueTotal)}</strong> outstanding balance, charged today
                  </li>
                ) : null}
                <li>Cancel any time. No long-term contract.</li>
              </ul>
              <AcceptCardForm
                action={startBilling}
                submitLabel="Start subscription"
                consent={consentText(settings, provider, !setupPaid)}
                apiLoginId={apiLoginId}
                clientKey={clientKey}
                env={env}
              />
            </CardBody>
          </Card>
        )
      ) : null}

      <section>
        <h2 className="mb-3 text-2xl">Invoices</h2>
        {invoices && invoices.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <Link href={`/dashboard/billing/invoices/${i.id}`} className="link tabular">
                      {i.number}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <LocalTime iso={i.paid_at ?? i.created_at} mode="date" />
                  </Td>
                  <Td>{i.description}</Td>
                  <Td className="tabular text-right">{money(i.amount_cents)}</Td>
                  <Td>
                    <Badge tone={INVOICE_STATUS_TONE[i.status]}>{INVOICE_STATUS_LABEL[i.status]}</Badge>
                    {i.status === "failed" && i.failure_reason ? <p className="mt-1 text-xs text-muted">{i.failure_reason}</p> : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No invoices yet">Your monthly plan, setup fee and any extra requests appear here.</EmptyState>
        )}
      </section>
    </div>
  );
}
