import { NextResponse, type NextRequest } from "next/server";
import { notifyRequestExpired, sendHireFollowup } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Daily email job (Vercel Cron, see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 *  - expiry notices for requests the hourly pg_cron job expired
 *  - "Did you hire them?" follow-up to clients 5 days after a request closed
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("[cron] admin client unavailable:", err);
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const now = Date.now();
  const { data: expired, error: expErr } = await admin
    .from("requests")
    .select("id")
    .eq("status", "expired")
    .is("closed_notified_at", null)
    .gte("closed_at", new Date(now - 14 * DAY).toISOString())
    .limit(200);
  if (expErr) console.error("[cron] expired query failed:", expErr.message);
  for (const r of expired ?? []) await notifyRequestExpired(r.id);

  const { data: followups, error: fuErr } = await admin
    .from("requests")
    .select("id")
    .in("status", ["completed", "closed_by_provider", "closed_by_client", "declined", "expired"])
    .is("followup_sent_at", null)
    .is("client_outcome", null)
    .eq("is_invalid", false)
    .lte("closed_at", new Date(now - 5 * DAY).toISOString())
    .gte("closed_at", new Date(now - 30 * DAY).toISOString())
    .limit(200);
  if (fuErr) console.error("[cron] follow-up query failed:", fuErr.message);
  for (const r of followups ?? []) await sendHireFollowup(r.id);

  return NextResponse.json({ expired: expired?.length ?? 0, followups: followups?.length ?? 0 });
}
