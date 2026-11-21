import "server-only";

import {
  arbToday,
  cancelSubscription as arbCancel,
  chargeProfile,
  createCustomerProfile,
  createPaymentProfile,
  createSubscription,
  deletePaymentProfile,
  getCardSummary,
  getSubscription,
  updateSubscription,
  type BillTo,
  type OpaqueData,
} from "@/lib/authnet";
import { escapeHtml as e, layout, link, sendEmail } from "@/lib/email";
import { formatDateOnly, money } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/database";

type Provider = Tables<"providers">;
type Account = Tables<"billing_accounts">;
type Invoice = Tables<"invoices">;
type Settings = Tables<"app_settings">;
type Result = { ok: true; message?: string } | { ok: false; message: string };

const db = () => createAdminClient();

export function planPricing(s: Settings, plan: Provider["plan"]) {
  return plan === "beta"
    ? { monthly: s.beta_monthly_cents, setup: s.beta_setup_cents, overage: s.beta_overage_cents }
    : { monthly: s.std_monthly_cents, setup: s.std_setup_cents, overage: s.std_overage_cents };
}

async function loadSettings(): Promise<Settings> {
  const { data, error } = await db().from("app_settings").select("*").eq("id", true).single();
  if (error || !data) throw new Error(`app_settings unavailable: ${error?.message}`);
  return data;
}

export async function getAccount(providerId: string): Promise<Account | null> {
  const { data } = await db().from("billing_accounts").select("*").eq("provider_id", providerId).maybeSingle();
  return data ?? null;
}

async function saveAccount(providerId: string, patch: Partial<Account>) {
  const { error } = await db()
    .from("billing_accounts")
    .upsert({ provider_id: providerId, ...patch }, { onConflict: "provider_id" });
  if (error) console.error("[billing] save account failed:", error.message);
}

async function providerEmail(provider: Pick<Provider, "profile_id">): Promise<string | null> {
  const { data } = await db().from("profiles").select("email").eq("id", provider.profile_id).maybeSingle();
  return data?.email ?? null;
}

function monthLabel(isoMonth: string): string {
  const [y, m] = isoMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function addMonths(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(d, last));
  return date.toISOString().slice(0, 10);
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Provider state
// ---------------------------------------------------------------------------

/** Payment failed: mark past due, pause new requests (unless FairGround already paused them), email. */
async function markFailure(provider: Provider, reason: string, notify = true) {
  await saveAccount(provider.id, { last_failure_reason: reason.slice(0, 500), last_failure_at: new Date().toISOString() });
  const patch: Partial<Provider> = { billing_status: "past_due" };
  if (provider.paused_reason !== "admin") {
    patch.requests_paused = true;
    patch.paused_reason = "billing";
    patch.paused_at = new Date().toISOString();
  }
  const { error } = await db().from("providers").update(patch).eq("id", provider.id);
  if (error) console.error("[billing] mark failure failed:", error.message);

  if (notify) {
    const to = await providerEmail(provider);
    if (to) {
      await sendEmail({
        to,
        template: "billing_payment_failed",
        relatedId: provider.id,
        subject: "Your FairGround payment did not go through",
        html: layout(
          "We could not take your payment",
          `<p style="margin:0 0 12px">Your card was not charged: ${e(reason)}.</p><p style="margin:0 0 12px">New requests are paused until your billing is up to date. Your profile stays listed. Update your card and we will lift the pause straight away.</p>`,
          { href: link("/dashboard/billing"), label: "Update your card" },
        ),
      });
    }
  }
}

/** Billing is good again: active, and lift a billing pause. */
async function markHealthy(provider: Provider) {
  const patch: Partial<Provider> = { billing_status: "active" };
  if (provider.requests_paused && provider.paused_reason === "billing") {
    patch.requests_paused = false;
    patch.paused_reason = null;
    patch.paused_at = null;
  }
  const { error } = await db().from("providers").update(patch).eq("id", provider.id);
  if (error) console.error("[billing] mark healthy failed:", error.message);
  await saveAccount(provider.id, { last_failure_reason: null, last_failure_at: null });
}

async function reloadProvider(id: string): Promise<Provider | null> {
  const { data } = await db().from("providers").select("*").eq("id", id).maybeSingle();
  return data ?? null;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

/** Charges a pending or failed one-off invoice (setup fee, extra requests) against the card on file. */
async function chargeInvoice(invoice: Invoice, account: Account | null): Promise<"paid" | "failed" | "no_card"> {
  if (!account?.authnet_customer_profile_id || !account.authnet_payment_profile_id) {
    await db().from("invoices").update({ failure_reason: "No card on file" }).eq("id", invoice.id);
    return "no_card";
  }
  const result = await chargeProfile({
    customerProfileId: account.authnet_customer_profile_id,
    paymentProfileId: account.authnet_payment_profile_id,
    amountCents: invoice.amount_cents,
    invoiceNumber: invoice.number,
    description: invoice.description,
  });
  const now = new Date().toISOString();
  if (result.ok) {
    await db()
      .from("invoices")
      .update({ status: "paid", authnet_transaction_id: result.transId, attempted_at: now, paid_at: now, failure_reason: null })
      .eq("id", invoice.id);
    return "paid";
  }
  console.warn(`[billing] invoice ${invoice.number} ${result.status}: ${result.code} ${result.message}`);
  await db()
    .from("invoices")
    .update({ status: "failed", authnet_transaction_id: result.transId, attempted_at: now, failure_reason: result.message.slice(0, 500) })
    .eq("id", invoice.id);
  return "failed";
}

/** Retries every unpaid one-off invoice for a provider. Returns the first failure reason, if any. */
async function settleOutstanding(providerId: string, account: Account): Promise<string | null> {
  const { data: open } = await db()
    .from("invoices")
    .select("*")
    .eq("provider_id", providerId)
    .in("status", ["pending", "failed"])
    .neq("kind", "subscription")
    .order("created_at");
  for (const inv of open ?? []) {
    const r = await chargeInvoice(inv, account);
    if (r !== "paid") {
      const { data } = await db().from("invoices").select("failure_reason").eq("id", inv.id).single();
      return data?.failure_reason ?? "Payment failed";
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Provider actions
// ---------------------------------------------------------------------------

export async function startSubscription(input: {
  provider: Provider;
  email: string;
  opaqueData: OpaqueData;
  billTo: BillTo;
  consentText: string;
  ip: string | null;
}): Promise<Result> {
  const { provider } = input;
  const settings = await loadSettings();
  const price = planPricing(settings, provider.plan);
  let account = await getAccount(provider.id);

  if (account?.arb_subscription_id && (account.subscription_status === "active" || account.subscription_status === "suspended")) {
    return { ok: false, message: "You already have a subscription. Use Update card to change your payment details." };
  }

  // 1. Store the card with Authorize.net (customer profile). We keep only the profile ids.
  let customerProfileId = account?.authnet_customer_profile_id ?? null;
  let paymentProfileId: string;
  const oldPaymentProfileId = account?.authnet_payment_profile_id ?? null;
  if (customerProfileId) {
    const added = await createPaymentProfile({ customerProfileId, billTo: input.billTo, opaqueData: input.opaqueData });
    if (!added.ok) return { ok: false, message: cardMessage(added.message) };
    paymentProfileId = added.paymentProfileId;
  } else {
    const created = await createCustomerProfile({
      merchantCustomerId: provider.id.replace(/-/g, "").slice(0, 20),
      description: provider.business_name,
      email: input.email,
      billTo: input.billTo,
      opaqueData: input.opaqueData,
    });
    if (!created.ok) return { ok: false, message: cardMessage(created.message) };
    customerProfileId = created.customerProfileId;
    paymentProfileId = created.paymentProfileId;
  }
  const card = await getCardSummary(customerProfileId, paymentProfileId);
  await saveAccount(provider.id, {
    authnet_customer_profile_id: customerProfileId,
    authnet_payment_profile_id: paymentProfileId,
    card_brand: card?.brand ?? null,
    card_last4: card?.last4 ?? null,
    card_exp: card?.exp ?? null,
    consent_at: new Date().toISOString(),
    consent_ip: input.ip,
    consent_text: input.consentText.slice(0, 2000),
  });
  if (oldPaymentProfileId && oldPaymentProfileId !== paymentProfileId) {
    await deletePaymentProfile(customerProfileId, oldPaymentProfileId);
  }
  account = await getAccount(provider.id);

  // 2. One-off setup fee, charged once.
  if (price.setup > 0) {
    const { data: paidSetup } = await db().from("invoices").select("id").eq("provider_id", provider.id).eq("kind", "setup_fee").eq("status", "paid").maybeSingle();
    if (!paidSetup) {
      const { data: inv, error } = await db()
        .from("invoices")
        .insert({ provider_id: provider.id, kind: "setup_fee", unit_cents: price.setup, amount_cents: price.setup, description: "FairGround one-time setup fee" })
        .select("*")
        .single();
      if (error || !inv) return { ok: false, message: "We could not create your setup invoice. Please try again." };
      const r = await chargeInvoice(inv, account);
      if (r !== "paid") {
        const { data } = await db().from("invoices").select("failure_reason").eq("id", inv.id).single();
        return { ok: false, message: cardMessage(data?.failure_reason ?? "The card was declined.") };
      }
    }
  }

  // 3. ARB monthly subscription. The first charge runs at about 2:00 a.m. Pacific on or after the start date.
  const sub = await createSubscription({
    name: `FairGround ${provider.plan === "beta" ? "Founding" : "Standard"}`,
    amountCents: price.monthly,
    startDate: arbToday(),
    customerProfileId,
    paymentProfileId,
  });
  if (!sub.ok) {
    console.error("[billing] ARB create failed:", sub.code, sub.message);
    return { ok: false, message: "Your card was saved, but we could not start the subscription. Please try again or contact us." };
  }
  await saveAccount(provider.id, {
    arb_subscription_id: sub.subscriptionId,
    subscription_status: "active",
    subscription_amount_cents: price.monthly,
    subscription_started_on: arbToday(),
    canceled_at: null,
  });
  await db().from("providers").update({ billing_status: "active" }).eq("id", provider.id);

  // 4. Anything already owed (for example extra requests from before billing started).
  const fresh = await getAccount(provider.id);
  const owed = fresh ? await settleOutstanding(provider.id, fresh) : null;
  const p = await reloadProvider(provider.id);
  if (p) {
    if (owed) await markFailure(p, owed);
    else await markHealthy(p);
  }

  const to = input.email;
  await sendEmail({
    to,
    template: "billing_started",
    relatedId: provider.id,
    subject: "Your FairGround subscription is active",
    html: layout(
      "You are all set",
      `<p style="margin:0 0 12px">Your ${e(provider.plan === "beta" ? "founding member" : "standard")} plan is active at ${e(money(price.monthly))} a month, including ${provider.monthly_cap} requests.</p>` +
        (provider.plan === "beta" && provider.plan_price_locked_until
          ? `<p style="margin:0 0 12px">Your price is locked until ${e(formatDateOnly(provider.plan_price_locked_until) ?? "")}. We will give you 60 days notice before any change.</p>`
          : "") +
        `<p style="margin:0 0 12px">Extra requests are only charged if you turn them on, at ${e(money(price.overage))} each.</p>`,
      { href: link("/dashboard/billing"), label: "View billing" },
    ),
  });
  return owed ? { ok: false, message: `Your subscription started, but an earlier balance failed: ${owed}` } : { ok: true };
}

export async function updateCard(input: { provider: Provider; opaqueData: OpaqueData; billTo: BillTo }): Promise<Result> {
  const { provider } = input;
  const account = await getAccount(provider.id);
  if (!account?.authnet_customer_profile_id) return { ok: false, message: "Start a subscription first." };

  const added = await createPaymentProfile({ customerProfileId: account.authnet_customer_profile_id, billTo: input.billTo, opaqueData: input.opaqueData });
  if (!added.ok) return { ok: false, message: cardMessage(added.message) };
  const newId = added.paymentProfileId;
  const profile = { customerProfileId: account.authnet_customer_profile_id, paymentProfileId: newId };

  let subscriptionStatus = account.subscription_status;
  if (account.arb_subscription_id && (subscriptionStatus === "active" || subscriptionStatus === "suspended")) {
    const upd = await updateSubscription({ subscriptionId: account.arb_subscription_id, profile });
    if (!upd.ok) {
      console.error("[billing] ARB update card failed:", upd.code, upd.message);
      await deletePaymentProfile(profile.customerProfileId, newId);
      return { ok: false, message: "We could not attach the new card to your subscription. Please try again." };
    }
    // Editing a suspended subscription corrects it. Confirm with Authorize.net.
    const sub = await getSubscription(account.arb_subscription_id);
    if (sub?.status) subscriptionStatus = normaliseStatus(sub.status);
  }
  if (account.authnet_payment_profile_id && account.authnet_payment_profile_id !== newId) {
    await deletePaymentProfile(profile.customerProfileId, account.authnet_payment_profile_id);
  }
  const card = await getCardSummary(profile.customerProfileId, newId);
  await saveAccount(provider.id, {
    authnet_payment_profile_id: newId,
    card_brand: card?.brand ?? null,
    card_last4: card?.last4 ?? null,
    card_exp: card?.exp ?? null,
    subscription_status: subscriptionStatus,
  });

  // A terminated subscription cannot be revived: start a fresh one on the new card.
  if (account.arb_subscription_id && subscriptionStatus === "terminated") {
    const settings = await loadSettings();
    const sub = await createSubscription({
      name: `FairGround ${provider.plan === "beta" ? "Founding" : "Standard"}`,
      amountCents: account.subscription_amount_cents ?? planPricing(settings, provider.plan).monthly,
      startDate: arbToday(),
      ...profile,
    });
    if (!sub.ok) return { ok: false, message: "Your card was saved, but we could not restart the subscription. Please contact us." };
    await saveAccount(provider.id, { arb_subscription_id: sub.subscriptionId, subscription_status: "active", subscription_started_on: arbToday() });
    subscriptionStatus = "active";
  }

  const fresh = await getAccount(provider.id);
  const owed = fresh ? await settleOutstanding(provider.id, fresh) : null;
  const p = await reloadProvider(provider.id);
  if (!p) return { ok: true };
  if (owed) {
    await markFailure(p, owed, false);
    return { ok: false, message: `Your card was saved, but the outstanding balance failed: ${owed}` };
  }
  if (subscriptionStatus === "active") await markHealthy(p);
  return { ok: true, message: "Your card is updated." };
}

export async function cancelProviderSubscription(provider: Provider): Promise<Result> {
  const account = await getAccount(provider.id);
  if (!account?.arb_subscription_id || account.subscription_status === "canceled") {
    return { ok: false, message: "There is no active subscription to cancel." };
  }
  const r = await arbCancel(account.arb_subscription_id);
  if (!r.ok) {
    console.error("[billing] ARB cancel failed:", r.code, r.message);
    return { ok: false, message: "We could not cancel right now. Please try again." };
  }
  await saveAccount(provider.id, { subscription_status: "canceled", canceled_at: new Date().toISOString() });
  await db().from("providers").update({ billing_status: "canceled" }).eq("id", provider.id);
  return {
    ok: true,
    message: account.paid_through
      ? `Your subscription is canceled. You keep receiving requests until ${formatDateOnly(account.paid_through)}.`
      : "Your subscription is canceled.",
  };
}

function cardMessage(raw: string): string {
  if (/declin/i.test(raw)) return "Your card was declined. Please check the details or use another card.";
  if (/expired/i.test(raw)) return "That card has expired. Please use another card.";
  if (/not configured/i.test(raw)) return "Payments are not available yet. Please try again later.";
  return `The payment processor said: ${raw}`;
}

function normaliseStatus(s: string): Account["subscription_status"] {
  const v = s.toLowerCase();
  return v === "active" || v === "suspended" || v === "canceled" || v === "terminated" || v === "expired" ? v : null;
}

// ---------------------------------------------------------------------------
// ARB payments (from webhooks and reconciliation)
// ---------------------------------------------------------------------------

export async function recordSubscriptionPayment(input: {
  subscriptionId: string;
  transId: string;
  approved: boolean;
  amountCents: number | null;
  submittedAt: string | null;
  reason: string | null;
}) {
  const { data: account } = await db().from("billing_accounts").select("*").eq("arb_subscription_id", input.subscriptionId).maybeSingle();
  if (!account) return;
  const { data: existing } = await db().from("invoices").select("id").eq("authnet_transaction_id", input.transId).maybeSingle();
  if (existing) return;

  const submitted = input.submittedAt ?? new Date().toISOString();
  const month = `${submitted.slice(0, 7)}-01`;
  const amount = input.amountCents ?? account.subscription_amount_cents ?? 0;
  const { error } = await db().from("invoices").insert({
    provider_id: account.provider_id,
    kind: "subscription",
    period_month: month,
    unit_cents: amount,
    amount_cents: amount,
    description: `Monthly plan, ${monthLabel(month)}`,
    status: input.approved ? "paid" : "failed",
    authnet_transaction_id: input.transId,
    authnet_subscription_id: input.subscriptionId,
    attempted_at: submitted,
    paid_at: input.approved ? submitted : null,
    failure_reason: input.approved ? null : (input.reason ?? "Declined").slice(0, 500),
  });
  if (error) {
    if (error.code !== "23505") console.error("[billing] record payment failed:", error.message);
    return;
  }

  const provider = await reloadProvider(account.provider_id);
  if (!provider) return;
  if (input.approved) {
    const through = addMonths(submitted, 1);
    if (!account.paid_through || through > account.paid_through) await saveAccount(provider.id, { paid_through: through });
    const { count } = await db().from("invoices").select("id", { count: "exact", head: true }).eq("provider_id", provider.id).eq("status", "failed").neq("kind", "subscription");
    if (!count && account.subscription_status !== "canceled") await markHealthy(provider);
  } else {
    await markFailure(provider, input.reason ?? "Your monthly payment was declined");
  }
}

export async function markSubscriptionStatus(subscriptionId: string, status: string, reason: string) {
  const { data: account } = await db().from("billing_accounts").select("*").eq("arb_subscription_id", subscriptionId).maybeSingle();
  if (!account) return;
  const next = normaliseStatus(status);
  if (!next || next === account.subscription_status) return;
  await saveAccount(account.provider_id, { subscription_status: next });
  const provider = await reloadProvider(account.provider_id);
  if (!provider) return;
  if (next === "suspended" || next === "terminated") await markFailure(provider, reason);
  if (next === "canceled" && provider.billing_status !== "canceled") {
    await db().from("providers").update({ billing_status: "canceled" }).eq("id", provider.id);
  }
}

// ---------------------------------------------------------------------------
// Scheduled jobs (daily, from /api/cron/billing)
// ---------------------------------------------------------------------------

/** Month-end: bill last month's extra requests at the price agreed when each one arrived. */
export async function runMonthEndOverage(): Promise<{ invoices: number; failed: number }> {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const settings = await loadSettings();
  const { data: rows, error } = await db()
    .from("requests")
    .select("provider_id, overage_price_cents")
    .eq("billing_month", prev)
    .eq("is_overage", true)
    .eq("is_invalid", false);
  if (error) {
    console.error("[billing] overage query failed:", error.message);
    return { invoices: 0, failed: 0 };
  }
  const byProvider = new Map<string, (number | null)[]>();
  for (const r of rows ?? []) byProvider.set(r.provider_id, [...(byProvider.get(r.provider_id) ?? []), r.overage_price_cents]);

  let invoices = 0;
  let failed = 0;
  for (const [providerId, prices] of byProvider) {
    const { data: exists } = await db().from("invoices").select("id").eq("provider_id", providerId).eq("kind", "overage").eq("period_month", prev).maybeSingle();
    if (exists) continue;
    const provider = await reloadProvider(providerId);
    if (!provider) continue;
    const fallback = planPricing(settings, provider.plan).overage;
    const amounts = prices.map((p) => p ?? fallback);
    const total = amounts.reduce((a, b) => a + b, 0);
    const { data: inv, error: insErr } = await db()
      .from("invoices")
      .insert({
        provider_id: providerId,
        kind: "overage",
        period_month: prev,
        quantity: amounts.length,
        unit_cents: Math.round(total / amounts.length),
        amount_cents: total,
        description: `${amounts.length} extra request${amounts.length === 1 ? "" : "s"}, ${monthLabel(prev)}`,
      })
      .select("*")
      .single();
    if (insErr || !inv) continue; // unique index: another run created it
    invoices++;
    const result = await chargeInvoice(inv, await getAccount(providerId));
    if (result === "failed") {
      failed++;
      const { data } = await db().from("invoices").select("failure_reason").eq("id", inv.id).single();
      await markFailure(provider, data?.failure_reason ?? "Extra request charge declined");
    }
  }
  return { invoices, failed };
}

/** Founding price lock: 60 days notice, then move the subscription to the standard price. */
export async function runPriceLock(): Promise<{ notices: number; changes: number }> {
  const settings = await loadSettings();
  const today = todayUtc();
  const in60 = addDays(today, 60);
  const { data: accounts } = await db()
    .from("billing_accounts")
    .select("*, providers!inner(*)")
    .eq("subscription_status", "active")
    .not("arb_subscription_id", "is", null);
  let notices = 0;
  let changes = 0;
  for (const row of accounts ?? []) {
    const { providers: provider, ...account } = row as Account & { providers: Provider };
    if (provider.plan !== "beta" || !provider.plan_price_locked_until) continue;

    if (!account.price_notice_sent_at && provider.plan_price_locked_until <= in60) {
      // Never less than 60 days notice, and never before the lock ends.
      const effective = provider.plan_price_locked_until > in60 ? provider.plan_price_locked_until : in60;
      const newAmount = settings.std_monthly_cents;
      const to = await providerEmail(provider);
      if (to) {
        await sendEmail({
          to,
          template: "billing_price_notice",
          relatedId: provider.id,
          subject: "Your founding member price lock is ending",
          html: layout(
            "60 days notice of a price change",
            `<p style="margin:0 0 12px">Thank you for being a founding member. Your locked price of ${e(money(account.subscription_amount_cents ?? settings.beta_monthly_cents))} a month ends soon.</p><p style="margin:0 0 12px">From ${e(formatDateOnly(effective) ?? effective)}, your plan moves to standard pricing: ${e(money(newAmount))} a month, with extra requests at ${e(money(settings.std_overage_cents))} each if you opt in. You can cancel at any time before then.</p>`,
            { href: link("/dashboard/billing"), label: "View billing" },
          ),
        });
      }
      await saveAccount(provider.id, { price_notice_sent_at: new Date().toISOString(), scheduled_amount_cents: newAmount, scheduled_change_on: effective });
      notices++;
      continue;
    }

    if (account.scheduled_amount_cents != null && account.scheduled_change_on && account.scheduled_change_on <= today && account.arb_subscription_id) {
      const upd = await updateSubscription({ subscriptionId: account.arb_subscription_id, amountCents: account.scheduled_amount_cents });
      if (!upd.ok) {
        console.error("[billing] price change failed:", upd.code, upd.message);
        continue;
      }
      await saveAccount(provider.id, { subscription_amount_cents: account.scheduled_amount_cents, scheduled_amount_cents: null, scheduled_change_on: null });
      await db().from("providers").update({ plan: "standard" }).eq("id", provider.id);
      changes++;
    }
  }
  return { notices, changes };
}

function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Checks ARB status and payments with Authorize.net, in case a webhook was missed. */
export async function reconcileSubscriptions(limit = 40): Promise<{ checked: number }> {
  const { data: accounts } = await db()
    .from("billing_accounts")
    .select("*")
    .not("arb_subscription_id", "is", null)
    .order("last_reconciled_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  let checked = 0;
  for (const account of accounts ?? []) {
    const sub = await getSubscription(account.arb_subscription_id as string);
    await saveAccount(account.provider_id, { last_reconciled_at: new Date().toISOString() });
    if (!sub) continue;
    checked++;
    for (const t of sub.transactions) {
      if (!t.transId || t.transId === "0") continue;
      await recordSubscriptionPayment({
        subscriptionId: account.arb_subscription_id as string,
        transId: String(t.transId),
        approved: /approved/i.test(t.response ?? ""),
        amountCents: account.subscription_amount_cents,
        submittedAt: t.submitTimeUTC ?? null,
        reason: t.response ?? null,
      });
    }
    if (account.subscription_status !== "canceled") {
      await markSubscriptionStatus(account.arb_subscription_id as string, sub.status, `Your subscription is ${sub.status}`);
    }
  }
  return { checked };
}

/** Canceled subscriptions stop receiving requests once the paid period ends. */
export async function pauseLapsedCancellations(): Promise<{ paused: number }> {
  const today = todayUtc();
  const { data } = await db().from("billing_accounts").select("provider_id, paid_through").eq("subscription_status", "canceled");
  let paused = 0;
  for (const a of data ?? []) {
    if (a.paid_through && a.paid_through > today) continue;
    const provider = await reloadProvider(a.provider_id);
    if (!provider || (provider.requests_paused && provider.paused_reason !== "manual")) continue;
    await db().from("providers").update({ requests_paused: true, paused_reason: "billing", paused_at: new Date().toISOString() }).eq("id", provider.id);
    paused++;
  }
  return { paused };
}
