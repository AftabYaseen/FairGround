import "server-only";

/**
 * Twilio Verify over its REST API (no SDK needed).
 * If keys are missing, callers get { ok: false, reason: "not_configured" } and decide
 * whether the dev bypass (ALLOW_UNVERIFIED_PHONE=true) applies.
 */

type VerifyResult =
  | { ok: true; status: string }
  | { ok: false; reason: "not_configured" | "invalid_code" | "provider_error"; message?: string };

function config() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const service = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid || !token || !service) return null;
  return { sid, token, service };
}

export function isTwilioConfigured(): boolean {
  return config() !== null;
}

export function phoneBypassAllowed(): boolean {
  return process.env.ALLOW_UNVERIFIED_PHONE === "true" && !isTwilioConfigured();
}

async function call(path: string, body: Record<string, string>): Promise<Response | null> {
  const c = config();
  if (!c) return null;
  return fetch(`https://verify.twilio.com/v2/Services/${c.service}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.sid}:${c.token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
}

export async function startPhoneVerification(phoneE164: string): Promise<VerifyResult> {
  try {
    const res = await call("Verifications", { To: phoneE164, Channel: "sms" });
    if (!res) return { ok: false, reason: "not_configured" };
    const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string };
    if (!res.ok) {
      console.error("[twilio] start verification failed:", res.status, json.message);
      return { ok: false, reason: "provider_error", message: json.message };
    }
    return { ok: true, status: json.status ?? "pending" };
  } catch (err) {
    console.error("[twilio] start verification error:", err);
    return { ok: false, reason: "provider_error" };
  }
}

export async function checkPhoneVerification(phoneE164: string, code: string): Promise<VerifyResult> {
  try {
    const res = await call("VerificationCheck", { To: phoneE164, Code: code });
    if (!res) return { ok: false, reason: "not_configured" };
    const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string };
    if (!res.ok) {
      // 404 means the verification expired or was already used.
      if (res.status === 404) return { ok: false, reason: "invalid_code" };
      console.error("[twilio] verification check failed:", res.status, json.message);
      return { ok: false, reason: "provider_error", message: json.message };
    }
    return json.status === "approved" ? { ok: true, status: "approved" } : { ok: false, reason: "invalid_code" };
  } catch (err) {
    console.error("[twilio] verification check error:", err);
    return { ok: false, reason: "provider_error" };
  }
}
