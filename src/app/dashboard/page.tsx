import type { Metadata } from "next";
import Link from "next/link";
import { CapBar } from "@/components/provider/cap-bar";
import { PausedBanner } from "@/components/provider/paused-banner";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LocalTime } from "@/components/ui/client";
import { EmptyState, PageHeader, Stat } from "@/components/ui/misc";
import { hoursLabel } from "@/lib/format";
import { requireProvider } from "@/lib/provider-session";
import { createClient } from "@/lib/supabase/server";
import { getProviderUsage } from "@/lib/usage";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { provider } = await requireProvider("/dashboard");
  const supabase = await createClient();
  const [usage, { data: active }, { count: totalCount }] = await Promise.all([
    getProviderUsage(provider.id),
    supabase
      .from("requests")
      .select("id, title, zip, city, created_at, viewed_at, responded_at, is_overage")
      .eq("provider_id", provider.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("requests").select("id", { count: "exact", head: true }).eq("provider_id", provider.id),
  ]);
  const newCount = (active ?? []).filter((r) => !r.viewed_at).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={provider.business_name}
        description="Every request here was sent to you only."
        actions={<LinkButton href="/dashboard/link" variant="secondary">Share your link</LinkButton>}
      />

      {provider.requests_paused ? <PausedBanner reason={provider.paused_reason} /> : null}

      <Card>
        <CardBody>
          <CapBar used={usage.used} cap={provider.monthly_cap} overage={usage.overage} />
          <p className="mt-4 text-sm">
            {provider.overage_opt_in ? (
              <Badge tone="info">Extra requests on</Badge>
            ) : (
              <Badge tone="neutral">Pauses at your limit</Badge>
            )}{" "}
            <Link href="/dashboard/settings" className="link ml-1">
              Change
            </Link>
          </p>
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="New (not opened)" value={newCount} />
        <Stat label="Open requests" value={active?.length ?? 0} />
        <Stat label="Typical response" value={<span className="text-xl">{hoursLabel(provider.avg_response_hours)}</span>} hint={`${totalCount ?? 0} requests all time`} />
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-[22px]">Open requests</h2>
          <Link href="/dashboard/requests" className="link text-sm">
            All requests
          </Link>
        </CardHeader>
        {active && active.length ? (
          <ul className="divide-y divide-line">
            {active.map((r) => (
              <li key={r.id}>
                <Link href={`/dashboard/requests/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-plaster sm:px-6">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.title}</p>
                    <p className="text-sm text-muted">
                      {r.city ? `${r.city}, ` : ""}
                      {r.zip} · <LocalTime iso={r.created_at} />
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!r.viewed_at ? <Badge tone="warning">New</Badge> : r.responded_at ? <Badge tone="success">Responded</Badge> : <Badge tone="info">Opened</Badge>}
                    {r.is_overage ? <Badge tone="neutral">Extra</Badge> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <CardBody>
            <EmptyState title="No open requests" action={<LinkButton href="/dashboard/link">Share your request link</LinkButton>}>
              New requests appear here and arrive by email.
            </EmptyState>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
