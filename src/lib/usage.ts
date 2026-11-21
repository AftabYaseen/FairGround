import "server-only";

import { createClient } from "@/lib/supabase/server";

export function currentBillingMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** This month's billable (non-invalid) requests for the signed-in provider. */
export async function getProviderUsage(providerId: string) {
  const supabase = await createClient();
  const month = currentBillingMonth();
  const { data, error } = await supabase
    .from("requests")
    .select("is_overage")
    .eq("provider_id", providerId)
    .eq("billing_month", month)
    .eq("is_invalid", false);
  if (error) console.error("[usage] failed:", error.message);
  const rows = data ?? [];
  return { used: rows.length, overage: rows.filter((r) => r.is_overage).length, month };
}
