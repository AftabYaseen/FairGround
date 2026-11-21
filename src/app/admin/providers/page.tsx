import type { Metadata } from "next";
import Link from "next/link";
import { adminUpdateProvider } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentBillingMonth } from "@/lib/usage";

export const metadata: Metadata = { title: "Admin: providers" };

function Action({ id, name, value, label, variant = "ghost" }: { id: string; name: string; value: string; label: string; variant?: "ghost" | "secondary" | "danger" }) {
  return (
    <form action={adminUpdateProvider}>
      <input type="hidden" name="provider_id" value={id} />
      <input type="hidden" name={name} value={value} />
      <button className={buttonClass(variant, "sm")}>{label}</button>
    </form>
  );
}

export default async function AdminProvidersPage() {
  await requireRole("admin", "/admin/providers");
  const supabase = await createClient();
  const [{ data: providers, error }, { data: usage }] = await Promise.all([
    supabase
      .from("providers")
      .select("id, business_name, slug, plan, is_listed, onboarded_at, requests_paused, paused_reason, monthly_cap, overage_opt_in, billing_status, plan_price_locked_until, profiles(email, status)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("requests").select("provider_id").eq("billing_month", currentBillingMonth()).eq("is_invalid", false),
  ]);
  const used = new Map<string, number>();
  for (const r of usage ?? []) used.set(r.provider_id, (used.get(r.provider_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Providers" description="Unlisting hides a provider from the directory and stops new requests, including through their link." />
      {error ? (
        <p className="text-danger">Could not load providers: {error.message}</p>
      ) : !providers?.length ? (
        <EmptyState title="No providers yet" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Provider</Th>
              <Th>Plan</Th>
              <Th>This month</Th>
              <Th>State</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id}>
                <Td>
                  <Link href={`/p/${p.slug}?from=browse`} className="link font-semibold">
                    {p.business_name}
                  </Link>
                  <p className="break-all text-muted">{p.profiles?.email}</p>
                  {!p.onboarded_at ? <Badge tone="neutral">Onboarding</Badge> : null}
                </Td>
                <Td>
                  <form action={adminUpdateProvider} className="flex items-center gap-1">
                    <input type="hidden" name="provider_id" value={p.id} />
                    <select name="plan" defaultValue={p.plan} aria-label="Plan" className="h-9 rounded-[6px] border border-line bg-white px-2 text-sm">
                      <option value="beta">Founding</option>
                      <option value="standard">Standard</option>
                    </select>
                    <input
                      name="monthly_cap"
                      defaultValue={p.monthly_cap}
                      aria-label="Included requests"
                      inputMode="numeric"
                      className="tabular h-9 w-16 rounded-[6px] border border-line bg-white px-2 text-sm"
                    />
                    <button className={buttonClass("secondary", "sm")}>Save</button>
                  </form>
                  <p className="mt-1 text-xs text-muted">
                    Billing: {p.billing_status}
                    {p.plan_price_locked_until ? `, locked to ${p.plan_price_locked_until}` : ""}
                  </p>
                </Td>
                <Td className="tabular whitespace-nowrap">
                  {used.get(p.id) ?? 0} / {p.monthly_cap}
                  <div className="text-xs text-muted">Extra {p.overage_opt_in ? "on" : "off"}</div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {p.is_listed ? <Badge tone="success">Listed</Badge> : <Badge tone="danger">Unlisted</Badge>}
                    {p.requests_paused ? <Badge tone="warning">Paused: {p.paused_reason}</Badge> : null}
                    {p.profiles?.status && p.profiles.status !== "active" ? <Badge tone="dark">{p.profiles.status}</Badge> : null}
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {p.is_listed ? (
                      <Action id={p.id} name="is_listed" value="false" label="Unlist" variant="danger" />
                    ) : (
                      <Action id={p.id} name="is_listed" value="true" label="List" variant="secondary" />
                    )}
                    {p.requests_paused && p.paused_reason === "admin" ? (
                      <Action id={p.id} name="admin_pause" value="false" label="Lift admin pause" variant="secondary" />
                    ) : (
                      <Action id={p.id} name="admin_pause" value="true" label="Admin pause" />
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
