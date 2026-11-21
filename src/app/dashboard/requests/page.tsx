import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/ui/client";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { requireProvider } from "@/lib/provider-session";
import { OUTCOME_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/request-codes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Requests" };

const TABS = [
  { key: "active", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
] as const;

export default async function ProviderRequestsPage(props: PageProps<"/dashboard/requests">) {
  const { provider } = await requireProvider("/dashboard/requests");
  const sp = await props.searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "active";

  const supabase = await createClient();
  let query = supabase
    .from("requests")
    .select("id, title, zip, city, status, outcome, created_at, viewed_at, is_overage, is_invalid, entry_path")
    .eq("provider_id", provider.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (tab === "active") query = query.eq("status", "active");
  if (tab === "closed") query = query.neq("status", "active");
  const { data: requests, error } = await query;

  return (
    <>
      <PageHeader title="Requests" description="Exclusive requests sent to you. Contact details are shared with you only." />
      <nav aria-label="Filter requests" className="mb-5 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/requests?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-[15px] font-semibold",
              tab === t.key ? "border-charcoal text-charcoal" : "border-transparent text-muted hover:text-charcoal",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {error ? (
        <p className="text-danger">We could not load your requests. Please refresh.</p>
      ) : !requests?.length ? (
        <EmptyState title={tab === "active" ? "No open requests" : "Nothing here yet"}>
          Requests from your link and the directory show up here.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id}>
              <Link href={`/dashboard/requests/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-white px-5 py-4 hover:border-muted">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.title}</p>
                  <p className="text-sm text-muted">
                    {r.city ? `${r.city}, ` : ""}
                    {r.zip} · <LocalTime iso={r.created_at} /> · {r.entry_path === "link" ? "Your link" : "Directory"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.status === "active" && !r.viewed_at ? <Badge tone="warning">New</Badge> : <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>}
                  {r.outcome ? <Badge tone="neutral">{OUTCOME_LABEL[r.outcome]}</Badge> : null}
                  {r.is_overage ? <Badge tone="info">Extra</Badge> : null}
                  {r.is_invalid ? <Badge tone="danger">Not billed</Badge> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
