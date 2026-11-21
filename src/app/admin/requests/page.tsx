import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/client";
import { Input, Label, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { STATUS_LABEL, STATUS_TONE, type RequestStatus } from "@/lib/request-codes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin: requests" };

const STATUSES = Object.keys(STATUS_LABEL) as RequestStatus[];

export default async function AdminRequestsPage(props: PageProps<"/admin/requests">) {
  await requireRole("admin", "/admin/requests");
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" && STATUSES.includes(sp.status as RequestStatus) ? (sp.status as RequestStatus) : "";
  const entry = sp.entry === "link" || sp.entry === "browse" ? sp.entry : "";
  const invalid = sp.invalid === "1";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const client = typeof sp.client === "string" && /^[0-9a-f-]{36}$/i.test(sp.client) ? sp.client : "";

  const supabase = await createClient();
  let query = supabase
    .from("requests")
    .select(
      "id, title, status, zip, entry_path, is_overage, is_invalid, created_at, contact_email, providers(business_name, slug)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status);
  if (entry) query = query.eq("entry_path", entry);
  if (invalid) query = query.eq("is_invalid", true);
  if (client) query = query.eq("client_id", client);
  if (q) query = query.or(`title.ilike.%${q.replace(/[%,()]/g, "")}%,contact_email.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data: requests, error } = await query;

  return (
    <>
      <PageHeader title="Requests" description="Every request on the platform, newest first (latest 100 matching)." />
      <form method="get" className="mb-6 grid gap-3 rounded-[10px] border border-line bg-white p-4 sm:grid-cols-[1fr_180px_150px_auto_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="q">Search title or client email</Label>
          <Input id="q" name="q" defaultValue={q} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={status}>
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="entry">Entry path</Label>
          <Select id="entry" name="entry" defaultValue={entry}>
            <option value="">Any</option>
            <option value="link">Provider link</option>
            <option value="browse">Directory</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 pb-2.5 text-sm font-medium">
          <input type="checkbox" name="invalid" value="1" defaultChecked={invalid} className="size-4 accent-[var(--charcoal)]" />
          Invalid only
        </label>
        <button className={buttonClass("primary")}>Filter</button>
      </form>

      {error ? (
        <p className="text-danger">Could not load requests: {error.message}</p>
      ) : !requests?.length ? (
        <EmptyState title="No requests match" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Request</Th>
              <Th>Provider</Th>
              <Th>Client</Th>
              <Th>Entry</Th>
              <Th>Status</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="hover:bg-plaster">
                <Td>
                  <Link href={`/admin/requests/${r.id}`} className="link font-semibold">
                    {r.title}
                  </Link>
                  <div className="mt-1 flex gap-1">
                    {r.is_overage ? <Badge tone="info">Extra</Badge> : null}
                    {r.is_invalid ? <Badge tone="danger">Invalid</Badge> : null}
                  </div>
                </Td>
                <Td>{r.providers?.business_name}</Td>
                <Td className="break-all">{r.contact_email}</Td>
                <Td>{r.entry_path === "link" ? "Link" : "Directory"}</Td>
                <Td>
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </Td>
                <Td className="whitespace-nowrap">
                  <LocalTime iso={r.created_at} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
