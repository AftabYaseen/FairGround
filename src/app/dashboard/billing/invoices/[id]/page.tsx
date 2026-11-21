import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/billing/print-button";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/ui/client";
import { money } from "@/lib/format";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE } from "@/lib/invoice-labels";
import { requireProvider } from "@/lib/provider-session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage(props: PageProps<"/dashboard/billing/invoices/[id]">) {
  const { id } = await props.params;
  const { provider } = await requireProvider(`/dashboard/billing/invoices/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).eq("provider_id", provider.id).maybeSingle();
  if (!inv) notFound();
  const { data: account } = await supabase.from("billing_accounts").select("card_brand, card_last4").eq("provider_id", provider.id).maybeSingle();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/dashboard/billing" className="link text-sm">
          Back to billing
        </Link>
        <PrintButton />
      </div>
      <article className="rounded-[10px] border border-line bg-white p-6 sm:p-10 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
          <div>
            <p className="font-heading text-2xl font-bold">FairGround</p>
            <p className="text-sm text-muted">A FairGround resource from OPAL Quality Systems Management</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted">{inv.status === "paid" ? "Receipt" : "Invoice"}</p>
            <p className="tabular font-heading text-xl font-bold">{inv.number}</p>
            <Badge tone={INVOICE_STATUS_TONE[inv.status]}>{INVOICE_STATUS_LABEL[inv.status]}</Badge>
          </div>
        </header>
        <dl className="grid gap-4 border-b border-line py-6 text-[15px] sm:grid-cols-3">
          <div>
            <dt className="font-semibold">Billed to</dt>
            <dd className="text-muted">{provider.business_name}</dd>
          </div>
          <div>
            <dt className="font-semibold">Date</dt>
            <dd className="text-muted">
              <LocalTime iso={inv.paid_at ?? inv.created_at} mode="date" />
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Payment</dt>
            <dd className="text-muted">
              {inv.status === "paid"
                ? `${account?.card_brand ?? "Card"}${account?.card_last4 ? ` ending ${account.card_last4}` : ""}`
                : inv.failure_reason ?? "Not yet charged"}
            </dd>
          </div>
        </dl>
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-3 font-semibold">Description</th>
              <th className="py-3 text-right font-semibold">Qty</th>
              <th className="py-3 text-right font-semibold">Unit</th>
              <th className="py-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="tabular">
            <tr className="border-b border-line">
              <td className="py-3">{inv.description}</td>
              <td className="py-3 text-right">{inv.quantity}</td>
              <td className="py-3 text-right">{money(inv.unit_cents)}</td>
              <td className="py-3 text-right">{money(inv.amount_cents)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-4 text-right font-semibold">
                Total
              </td>
              <td className="tabular pt-4 text-right font-heading text-xl font-bold">{money(inv.amount_cents)}</td>
            </tr>
          </tfoot>
        </table>
        {inv.authnet_transaction_id ? (
          <p className="mt-8 text-sm text-muted">Transaction reference {inv.authnet_transaction_id}. Requests are not refundable.</p>
        ) : null}
      </article>
    </div>
  );
}
