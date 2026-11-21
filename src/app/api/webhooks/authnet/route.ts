import { after, NextResponse, type NextRequest } from "next/server";
import { getTransactionDetails, verifyWebhookSignature } from "@/lib/authnet";
import { markSubscriptionStatus, recordSubscriptionPayment } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Notification = {
  notificationId?: string;
  eventType?: string;
  eventDate?: string;
  payload?: { id?: string | number; entityName?: string; status?: string; responseCode?: number; authAmount?: number };
};

const SUBSCRIPTION_STATUS: Record<string, string> = {
  "net.authorize.customer.subscription.suspended": "suspended",
  "net.authorize.customer.subscription.terminated": "terminated",
  "net.authorize.customer.subscription.cancelled": "canceled",
  "net.authorize.customer.subscription.failed": "suspended",
  "net.authorize.customer.subscription.expired": "expired",
};

async function process(n: Notification) {
  const type = n.eventType ?? "";
  const id = n.payload?.id != null ? String(n.payload.id) : null;
  if (!id) return;

  if (type === "net.authorize.payment.authcapture.created") {
    // Only ARB charges are recorded here; one-off charges are recorded when we make them.
    const tx = await getTransactionDetails(id);
    const subscriptionId = tx?.subscription?.id != null ? String(tx.subscription.id) : null;
    if (!tx || !subscriptionId) return;
    await recordSubscriptionPayment({
      subscriptionId,
      transId: tx.transId,
      approved: Number(tx.responseCode) === 1,
      amountCents: tx.authAmount != null ? Math.round(Number(tx.authAmount) * 100) : null,
      submittedAt: tx.submitTimeUTC ?? null,
      reason: tx.responseReasonDescription ?? null,
    });
    return;
  }

  const status = SUBSCRIPTION_STATUS[type];
  if (status) {
    await markSubscriptionStatus(id, status, status === "canceled" ? "Subscription canceled" : `Your subscription was ${status} by the payment processor`);
  }
}

/** Authorize.net webhooks. Verified with X-ANET-Signature, logged once per notification id. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-anet-signature"))) {
    console.warn("[webhook] rejected: bad or missing signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let n: Notification;
  try {
    n = JSON.parse(raw) as Notification;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!n.notificationId || !n.eventType) return NextResponse.json({ ok: true });

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("[webhook] admin client unavailable:", err);
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const { error } = await admin
    .from("billing_events")
    .insert({ notification_id: n.notificationId, event_type: n.eventType, payload: n as never });
  if (error) {
    // 23505: a retry of a notification we already have.
    if (error.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    console.error("[webhook] log failed:", error.message);
    return NextResponse.json({ error: "log failed" }, { status: 500 });
  }

  // Answer quickly (Authorize.net retries slow endpoints), then do the work.
  after(async () => {
    let errorText: string | null = null;
    try {
      await process(n);
    } catch (err) {
      errorText = err instanceof Error ? err.message : String(err);
      console.error("[webhook] processing failed:", errorText);
    }
    await admin
      .from("billing_events")
      .update({ processed_at: new Date().toISOString(), error: errorText })
      .eq("notification_id", n.notificationId as string);
  });

  return NextResponse.json({ ok: true });
}
