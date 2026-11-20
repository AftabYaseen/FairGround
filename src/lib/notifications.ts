import "server-only";

import { escapeHtml as e, layout, link, sendEmail } from "@/lib/email";
import { formatPhone, money } from "@/lib/format";
import { OUTCOME_LABEL, STATUS_LABEL } from "@/lib/request-codes";
import { overageCentsForPlan } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/database";

type RequestRow = Tables<"requests">;
type ProviderRow = Pick<Tables<"providers">, "id" | "business_name" | "slug" | "profile_id" | "monthly_cap" | "plan" | "overage_opt_in">;

async function load(requestId: string) {
  const admin = createAdminClient();
  const { data: request } = await admin.from("requests").select("*").eq("id", requestId).maybeSingle();
  if (!request) return null;
  const { data: provider } = await admin
    .from("providers")
    .select("id, business_name, slug, profile_id, monthly_cap, plan, overage_opt_in")
    .eq("id", request.provider_id)
    .maybeSingle();
  if (!provider) return null;
  const { data: providerProfile } = await admin.from("profiles").select("email, full_name").eq("id", provider.profile_id).maybeSingle();
  const { data: category } = await admin.from("service_categories").select("name").eq("id", request.category_id).maybeSingle();
  const { data: clientProfile } = await admin.from("profiles").select("email, full_name").eq("id", request.client_id).maybeSingle();
  return {
    admin,
    request: request as RequestRow,
    provider: provider as ProviderRow,
    providerEmail: providerProfile?.email ?? null,
    clientEmail: clientProfile?.email ?? request.contact_email,
    categoryName: category?.name ?? "Service",
  };
}

function para(text: string) {
  return `<p style="margin:0 0 12px">${text}</p>`;
}

function details(rows: [string, string | null | undefined][]) {
  const body = rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#5E646B;vertical-align:top;white-space:nowrap">${e(k)}</td><td style="padding:6px 0;white-space:pre-line">${e(v as string)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;font-size:15px">${body}</table>`;
}

async function safely(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error(`[notifications] ${label} failed:`, err);
  }
}

/** New request: email the provider (with client contact details) and confirm to the client. */
export async function notifyRequestCreated(requestId: string, capReached: boolean) {
  await safely("request created", async () => {
    const d = await load(requestId);
    if (!d) return;
    const { request: r, provider: p } = d;

    if (d.providerEmail) {
      await sendEmail({
        to: d.providerEmail,
        template: "provider_new_request",
        relatedId: r.id,
        subject: `New request: ${r.title}`,
        html: layout(
          "You have a new exclusive request",
          para(`This request was sent to <strong>${e(p.business_name)}</strong> only. No one else received it.`) +
            details([
              ["Job", r.title],
              ["Service", d.categoryName],
              ["Location", [r.city, r.zip].filter(Boolean).join(", ")],
              ["Timing", r.preferred_timing],
              ["Details", r.description],
              ["Client", r.contact_name],
              ["Email", r.contact_email],
              ["Phone", formatPhone(r.contact_phone)],
              ["Billing", r.is_overage ? "Extra request (beyond your included requests)" : "Included request"],
            ]),
          { href: link(`/dashboard/requests/${r.id}`), label: "Open the request" },
        ),
      });
    }

    await sendEmail({
      to: d.clientEmail,
      template: "client_confirmation",
      relatedId: r.id,
      subject: `Your request was sent to ${p.business_name}`,
      html: layout(
        "Your request is on its way",
        para(`We sent your request to <strong>${e(p.business_name)}</strong>, and only to them. They will contact you directly.`) +
          details([
            ["Job", r.title],
            ["Service", d.categoryName],
            ["ZIP", r.zip],
          ]) +
          para(
            "You can have one active request at a time. If this provider cannot help, close the request and you can send a new one.",
          ),
        { href: link("/my-request"), label: "View your request" },
      ),
    });

    if (capReached && d.providerEmail) {
      const { data: settings } = await d.admin.from("app_settings").select("*").eq("id", true).maybeSingle();
      const overage = settings ? money(overageCentsForPlan(settings, p.plan)) : "a set price";
      await sendEmail({
        to: d.providerEmail,
        template: "cap_reached",
        relatedId: p.id,
        subject: "You have used all included requests this month",
        html: layout(
          "Your monthly limit is reached",
          para(
            `You have received all ${p.monthly_cap} included requests for this month. We have paused new requests so you are never charged without agreeing to it.`,
          ) +
            para(
              `Requests start again automatically on the 1st of next month. If you want more work now, you can turn on extra requests at ${e(overage)} each.`,
            ),
          { href: link("/dashboard/settings"), label: "Review your settings" },
        ),
      });
    }
  });
}

/** A request was closed: tell the other party. */
export async function notifyRequestClosed(requestId: string) {
  await safely("request closed", async () => {
    const d = await load(requestId);
    if (!d || d.request.status === "active" || d.request.closed_notified_at) return;
    const { request: r, provider: p } = d;
    const label = STATUS_LABEL[r.status];

    if (r.status === "closed_by_client" && d.providerEmail) {
      await sendEmail({
        to: d.providerEmail,
        template: "request_closed",
        relatedId: r.id,
        subject: `Request closed by the client: ${r.title}`,
        html: layout(
          "A client closed their request",
          para(`${e(r.contact_name)} closed the request "${e(r.title)}".`) +
            (r.client_outcome ? para(`They reported: ${e(OUTCOME_LABEL[r.client_outcome])}.`) : ""),
          { href: link(`/dashboard/requests/${r.id}`), label: "View request" },
        ),
      });
    } else if (["declined", "completed", "closed_by_provider", "closed_by_admin"].includes(r.status)) {
      const body =
        r.status === "declined"
          ? para(`${e(p.business_name)} is not able to take on "${e(r.title)}". You can now send a new request to another provider.`)
          : r.status === "completed"
            ? para(`${e(p.business_name)} marked "${e(r.title)}" as completed. Thank you for using FairGround.`)
            : para(`Your request "${e(r.title)}" has been closed (${e(label)}). You can now send a new request.`);
      await sendEmail({
        to: d.clientEmail,
        template: "request_closed",
        relatedId: r.id,
        subject: `Your request was updated: ${label}`,
        html: layout("Your request has been closed", body, { href: link("/my-request"), label: "View your requests" }),
      });
    }
    await d.admin.from("requests").update({ closed_notified_at: new Date().toISOString() }).eq("id", r.id);
  });
}

/** Expired requests: tell both sides. Called from the cron route. */
export async function notifyRequestExpired(requestId: string) {
  await safely("request expired", async () => {
    const d = await load(requestId);
    if (!d || d.request.status !== "expired" || d.request.closed_notified_at) return;
    const { request: r, provider: p } = d;
    await sendEmail({
      to: d.clientEmail,
      template: "request_expired",
      relatedId: r.id,
      subject: "Your request has expired",
      html: layout(
        "Your request has expired",
        para(`Your request "${e(r.title)}" to ${e(p.business_name)} reached its time limit and has closed. You can now send a new request.`),
        { href: link("/my-request"), label: "View your requests" },
      ),
    });
    if (d.providerEmail) {
      await sendEmail({
        to: d.providerEmail,
        template: "request_expired",
        relatedId: r.id,
        subject: `Request expired: ${r.title}`,
        html: layout(
          "A request expired",
          para(`The request "${e(r.title)}" from ${e(r.contact_name)} expired before it was closed.`),
          { href: link(`/dashboard/requests/${r.id}`), label: "View request" },
        ),
      });
    }
    await d.admin.from("requests").update({ closed_notified_at: new Date().toISOString() }).eq("id", r.id);
  });
}

/** "Did you hire them?" five days after a request closes. Called from the cron route. */
export async function sendHireFollowup(requestId: string) {
  await safely("hire follow-up", async () => {
    const d = await load(requestId);
    if (!d || d.request.followup_sent_at || d.request.client_outcome) return;
    const { request: r, provider: p } = d;
    await sendEmail({
      to: d.clientEmail,
      template: "hire_followup",
      relatedId: r.id,
      subject: `Did you hire ${p.business_name}?`,
      html: layout(
        `Did you hire ${p.business_name}?`,
        para(`A few days ago your request "${e(r.title)}" was closed. Did it turn into work?`) +
          para("Your one-click answer helps us keep FairGround fair for everyone."),
        { href: link("/my-request#history"), label: "Answer in one click" },
      ),
    });
    await d.admin.from("requests").update({ followup_sent_at: new Date().toISOString() }).eq("id", r.id);
  });
}
