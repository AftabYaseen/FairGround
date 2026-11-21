import "server-only";

import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type EmailTemplate =
  | "provider_new_request"
  | "client_confirmation"
  | "request_closed"
  | "request_expired"
  | "cap_reached"
  | "hire_followup"
  | "billing_started"
  | "billing_payment_failed"
  | "billing_price_notice";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** Simple, accessible email layout in the FairGround palette. `bodyHtml` must already be escaped. */
export function layout(heading: string, bodyHtml: string, cta?: { href: string; label: string }): string {
  const button = cta
    ? `<p style="margin:28px 0 0"><a href="${cta.href}" style="display:inline-block;background:#F2B705;color:#1E2124;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:6px">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F3F0E9;font-family:Figtree,Segoe UI,Arial,sans-serif;color:#1E2124">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #D6D0C2;border-radius:10px">
<tr><td style="background:#1E2124;padding:18px 24px;border-radius:10px 10px 0 0;color:#FFFFFF;font-weight:700;font-size:18px">FairGround</td></tr>
<tr><td style="height:6px;background:repeating-linear-gradient(-45deg,#1E2124 0 10px,#F2B705 10px 20px)"></td></tr>
<tr><td style="padding:28px 24px;font-size:16px;line-height:1.6">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">${escapeHtml(heading)}</h1>
${bodyHtml}${button}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #D6D0C2;font-size:12px;color:#5E646B">A FairGround resource from OPAL Quality Systems Management. You are receiving this because you have a FairGround account.</td></tr>
</table></td></tr></table></body></html>`;
}

export function link(path: string): string {
  return `${siteUrl()}${path}`;
}

/**
 * Sends one email through Resend and records it in notifications_log.
 * Never throws: a missing key or provider error is logged and the caller carries on.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  template: EmailTemplate;
  relatedId?: string | null;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  let status: "sent" | "failed" | "skipped" = "skipped";
  let errorText: string | null = null;

  if (!apiKey || !from) {
    errorText = "RESEND_API_KEY or EMAIL_FROM not set";
    console.warn(`[email] skipped ${opts.template} to ${opts.to}: ${errorText}`);
  } else {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html }),
        cache: "no-store",
      });
      if (res.ok) {
        status = "sent";
      } else {
        status = "failed";
        errorText = `${res.status} ${(await res.text().catch(() => "")).slice(0, 400)}`;
        console.error(`[email] ${opts.template} failed:`, errorText);
      }
    } catch (err) {
      status = "failed";
      errorText = err instanceof Error ? err.message : String(err);
      console.error(`[email] ${opts.template} error:`, errorText);
    }
  }

  try {
    const admin = createAdminClient();
    await admin.from("notifications_log").insert({
      to_email: opts.to,
      template: opts.template,
      related_id: opts.relatedId ?? null,
      status,
      error: errorText,
    });
  } catch (err) {
    console.error("[email] could not write notifications_log:", err);
  }
  return status === "sent";
}
