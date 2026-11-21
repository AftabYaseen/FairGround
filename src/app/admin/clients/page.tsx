import type { Metadata } from "next";
import Link from "next/link";
import { adminSetClientStatus } from "@/app/actions/admin";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/client";
import { Input, Label, Select } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { formatPhone } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin: clients" };

const STATUS_TONE: Record<string, BadgeTone> = { active: "success", warned: "warning", locked: "danger", suspended: "dark" };

function StatusButton({ id, status, label, reset, variant = "ghost" }: { id: string; status: string; label: string; reset?: boolean; variant?: "ghost" | "danger" | "secondary" }) {
  return (
    <form action={adminSetClientStatus}>
      <input type="hidden" name="client_id" value={id} />
      <input type="hidden" name="status" value={status} />
      {reset ? <input type="hidden" name="reset" value="true" /> : null}
      <button className={buttonClass(variant, "sm")}>{label}</button>
    </form>
  );
}

export default async function AdminClientsPage(props: PageProps<"/admin/clients">) {
  await requireRole("admin", "/admin/clients");
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" && ["active", "warned", "locked", "suspended"].includes(sp.status) ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";

  const supabase = await createClient();
  let query = supabase
    .from("profiles")
    .select("id, full_name, email, phone, phone_verified_at, status, locked_until, violation_count, device_fingerprint, created_at")
    .eq("role", "client")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status as "active" | "warned" | "locked" | "suspended");
  if (q) {
    const safe = q.replace(/[%,()]/g, "");
    query = query.or(`email.ilike.%${safe}%,full_name.ilike.%${safe}%`);
  }
  const { data: clients, error } = await query;

  return (
    <>
      <PageHeader title="Clients" description="Account status follows the ladder: warning, 7-day lock, suspension. You can override or restore at any time." />
      <form method="get" className="mb-6 grid gap-3 rounded-[10px] border border-line bg-white p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="q">Search name or email</Label>
          <Input id="q" name="q" defaultValue={q} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={status}>
            <option value="">Any</option>
            <option value="active">Active</option>
            <option value="warned">Warned</option>
            <option value="locked">Locked</option>
            <option value="suspended">Suspended</option>
          </Select>
        </div>
        <button className={buttonClass("primary")}>Filter</button>
      </form>

      {error ? (
        <p className="text-danger">Could not load clients: {error.message}</p>
      ) : !clients?.length ? (
        <EmptyState title="No clients match" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Client</Th>
              <Th>Phone</Th>
              <Th>Status</Th>
              <Th>Violations</Th>
              <Th>Joined</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <Td>
                  <p className="font-semibold">{c.full_name || "No name"}</p>
                  <p className="break-all text-muted">{c.email}</p>
                  <Link href={`/admin/requests?client=${c.id}`} className="link text-sm">
                    Requests
                  </Link>
                </Td>
                <Td className="whitespace-nowrap">
                  {formatPhone(c.phone) || "None"}
                  <div>{c.phone_verified_at ? <Badge tone="success">Verified</Badge> : <Badge tone="neutral">Unverified</Badge>}</div>
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  {c.status === "locked" && c.locked_until ? (
                    <p className="mt-1 text-xs text-muted">
                      until <LocalTime iso={c.locked_until} />
                    </p>
                  ) : null}
                </Td>
                <Td className="tabular">{c.violation_count}</Td>
                <Td className="whitespace-nowrap">
                  <LocalTime iso={c.created_at} mode="date" />
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {c.status !== "active" || c.violation_count > 0 ? <StatusButton id={c.id} status="active" label="Restore" reset variant="secondary" /> : null}
                    {c.status !== "warned" ? <StatusButton id={c.id} status="warned" label="Warn" /> : null}
                    {c.status !== "locked" ? <StatusButton id={c.id} status="locked" label="Lock 7 days" /> : null}
                    {c.status !== "suspended" ? <StatusButton id={c.id} status="suspended" label="Suspend" variant="danger" /> : null}
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
