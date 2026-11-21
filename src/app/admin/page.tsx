import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { PageHeader, Stat } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin" };

type Metrics = {
  ok: boolean;
  providers_total: number;
  providers_beta: number;
  clients_total: number;
  requests_total: number;
  requests_this_month: number;
  requests_active: number;
  requests_invalid: number;
  avg_per_provider_week: number | null;
  avg_per_provider_month: number | null;
  pct_hit_cap_this_month: number | null;
  pct_overage_opt_in: number | null;
  overage_requests_this_month: number;
  avg_response_hours: number | null;
  outcomes_reported: number;
  hire_rate_pct: number | null;
  open_flags: number;
  entry_link_pct: number | null;
  monthly: { month: string; requests: number; providers: number }[];
  per_provider_month: { provider_id: string; used: number; cap: number; overage: boolean }[];
};

const pct = (v: number | null) => (v == null ? "No data" : `${v}%`);
const num = (v: number | null) => (v == null ? "No data" : String(v));

export default async function AdminOverviewPage() {
  await requireRole("admin", "/admin");
  const supabase = await createClient();
  const [{ data, error }, settings] = await Promise.all([supabase.rpc("admin_metrics"), getSettings()]);
  const m = data as Metrics | null;

  if (error || !m?.ok) {
    return (
      <>
        <PageHeader title="Overview" />
        <Alert tone="danger">Metrics could not be loaded. {error?.message}</Alert>
      </>
    );
  }

  const ids = m.per_provider_month.slice(0, 10).map((p) => p.provider_id);
  const { data: names } = ids.length ? await supabase.from("providers").select("id, business_name, slug").in("id", ids) : { data: [] };
  const nameOf = new Map((names ?? []).map((n) => [n.id, n]));

  return (
    <div className="space-y-8">
      <PageHeader title="Overview" description="Beta success metrics. Invalid (spam or fake) requests are excluded." />

      {m.open_flags > 0 ? (
        <Alert tone="warning" title={`${m.open_flags} open abuse flag${m.open_flags === 1 ? "" : "s"}`}>
          <Link href="/admin/flags" className="link">
            Review the queue
          </Link>
        </Alert>
      ) : null}

      <section>
        <h2 className="mb-3 text-xl">Network</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Providers onboarded" value={m.providers_total} hint={`${m.providers_beta} founding of ${settings.beta_capacity} spots`} />
          <Stat label="Clients" value={m.clients_total} />
          <Stat label="Requests this month" value={m.requests_this_month} hint={`${m.requests_total} all time`} />
          <Stat label="Active requests" value={m.requests_active} hint={`${m.requests_invalid} marked invalid`} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl">Beta success metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label="Requests per provider per week" value={num(m.avg_per_provider_week)} hint="Average over active weeks, last 12 weeks" />
          <Stat label="Requests per provider per month" value={num(m.avg_per_provider_month)} hint="Average over active months, last 12 months" />
          <Stat label="Providers hitting the cap" value={pct(m.pct_hit_cap_this_month)} hint="This month" />
          <Stat label="Providers opted into extra requests" value={pct(m.pct_overage_opt_in)} hint={`${m.overage_requests_this_month} extra requests this month`} />
          <Stat label="Average response time" value={m.avg_response_hours == null ? "No data" : `${m.avg_response_hours} h`} hint="From request to first response" />
          <Stat label="Hire rate" value={pct(m.hire_rate_pct)} hint={`From ${m.outcomes_reported} reported outcomes`} />
          <Stat label="Requests from provider links" value={pct(m.entry_link_pct)} hint="The rest came from the directory" />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div>
          <h2 className="mb-3 text-xl">Requests by month</h2>
          {m.monthly.length ? (
            <Table className="min-w-0">
              <thead>
                <tr>
                  <Th>Month</Th>
                  <Th className="text-right">Requests</Th>
                  <Th className="text-right">Providers with requests</Th>
                </tr>
              </thead>
              <tbody className="tabular">
                {m.monthly.map((row) => (
                  <tr key={row.month}>
                    <Td>{row.month.slice(0, 7)}</Td>
                    <Td className="text-right">{row.requests}</Td>
                    <Td className="text-right">{row.providers}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-muted">No requests yet.</p>
          )}
        </div>
        <div>
          <h2 className="mb-3 text-xl">Busiest providers this month</h2>
          {m.per_provider_month.length ? (
            <Table className="min-w-0">
              <thead>
                <tr>
                  <Th>Provider</Th>
                  <Th className="text-right">Used / cap</Th>
                  <Th>Extra</Th>
                </tr>
              </thead>
              <tbody>
                {m.per_provider_month.slice(0, 10).map((p) => (
                  <tr key={p.provider_id}>
                    <Td>{nameOf.get(p.provider_id)?.business_name ?? p.provider_id.slice(0, 8)}</Td>
                    <Td className="tabular text-right">
                      {p.used} / {p.cap}
                    </Td>
                    <Td>{p.overage ? "On" : "Off"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-muted">No providers yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
