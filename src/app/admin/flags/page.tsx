import type { Metadata } from "next";
import Link from "next/link";
import { adminResolveFlag, adminSetClientStatus } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/client";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin: abuse flags" };

const TYPE_LABEL: Record<string, string> = {
  duplicate_job: "Duplicate job",
  rate_limit: "Rate limit hit",
  shared_device: "Shares a device with a suspended account",
  multi_account: "Phone already used by another account",
  manual: "Admin action",
};

const TABS = ["open", "resolved", "dismissed"] as const;

export default async function AdminFlagsPage(props: PageProps<"/admin/flags">) {
  await requireRole("admin", "/admin/flags");
  const sp = await props.searchParams;
  const tab = TABS.find((t) => t === sp.tab) ?? "open";
  const supabase = await createClient();
  const { data: flags, error } = await supabase
    .from("abuse_flags")
    .select("id, type, details, status, created_at, resolved_at, client_id, profiles!abuse_flags_client_id_fkey(email, full_name, status, violation_count)")
    .eq("status", tab)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader title="Abuse flags" description="Duplicate jobs escalate automatically. Everything else waits here for a decision." />
      <nav aria-label="Flag status" className="mb-5 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/admin/flags?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-4 py-2 text-[15px] font-semibold capitalize", tab === t ? "border-charcoal" : "border-transparent text-muted hover:text-charcoal")}
          >
            {t}
          </Link>
        ))}
      </nav>
      {error ? (
        <p className="text-danger">Could not load flags: {error.message}</p>
      ) : !flags?.length ? (
        <EmptyState title={tab === "open" ? "The queue is clear" : "Nothing here"} />
      ) : (
        <ul className="space-y-3">
          {flags.map((f) => {
            const d = (f.details ?? {}) as Record<string, unknown>;
            return (
              <li key={f.id} className="rounded-[10px] border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <Badge tone={f.type === "duplicate_job" ? "danger" : f.type === "manual" ? "neutral" : "warning"}>{TYPE_LABEL[f.type] ?? f.type}</Badge>
                    <p className="font-semibold">
                      {f.profiles?.full_name || "No name"} <span className="font-normal text-muted">{f.profiles?.email}</span>
                    </p>
                    <p className="text-sm text-muted">
                      <LocalTime iso={f.created_at} /> · Account {f.profiles?.status}, {f.profiles?.violation_count} violation(s)
                    </p>
                    {typeof d.matched_request_id === "string" ? (
                      <p className="text-sm">
                        Matches{" "}
                        <Link href={`/admin/requests/${d.matched_request_id}`} className="link">
                          an earlier request
                        </Link>
                        {typeof d.similarity === "number" ? ` (similarity ${d.similarity.toFixed(2)})` : ""}
                        {typeof d.provider_slug === "string" ? `, tried to send to ${d.provider_slug}` : ""}
                      </p>
                    ) : null}
                    <code className="block max-w-full overflow-x-auto text-xs text-muted">{JSON.stringify(d)}</code>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {tab === "open" ? (
                      <>
                        <form action={adminResolveFlag}>
                          <input type="hidden" name="flag_id" value={f.id} />
                          <input type="hidden" name="status" value="resolved" />
                          <button className={buttonClass("secondary", "sm")}>Resolve</button>
                        </form>
                        <form action={adminResolveFlag}>
                          <input type="hidden" name="flag_id" value={f.id} />
                          <input type="hidden" name="status" value="dismissed" />
                          <button className={buttonClass("ghost", "sm")}>Dismiss</button>
                        </form>
                        {f.profiles?.status !== "active" ? (
                          <form action={adminSetClientStatus}>
                            <input type="hidden" name="client_id" value={f.client_id} />
                            <input type="hidden" name="status" value="active" />
                            <input type="hidden" name="reset" value="true" />
                            <button className={buttonClass("ghost", "sm")}>Restore client</button>
                          </form>
                        ) : null}
                      </>
                    ) : (
                      <form action={adminResolveFlag}>
                        <input type="hidden" name="flag_id" value={f.id} />
                        <input type="hidden" name="status" value="open" />
                        <button className={buttonClass("ghost", "sm")}>Reopen</button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
