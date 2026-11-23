"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { checkRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { toE164 } from "@/lib/format";
import { postLoginPath } from "@/lib/post-login";
import { hitRateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request-meta";
import { safeNext } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPhoneVerification, phoneBypassAllowed, startPhoneVerification } from "@/lib/twilio";

async function phoneTakenByOther(phone: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .not("phone_verified_at", "is", null)
    .eq("role", "client")
    .neq("id", userId)
    .limit(1);
  return Boolean(data && data.length > 0);
}

/** Step 1: save the (unverified) number on the profile and send an SMS code. */
export async function sendPhoneCode(_prev: FormState, formData: FormData): Promise<FormState> {
  // Phone verification is for clients only.
  const session = await checkRole("client");
  if (!session) return { error: "Only client accounts verify a phone number." };

  const phone = toE164(String(formData.get("phone") ?? ""));
  if (!phone) {
    return { error: "Enter a valid phone number.", fieldErrors: { phone: ["Enter a valid phone number."] } };
  }

  const { ip } = await getRequestMeta();
  const allowed =
    (await hitRateLimit(`user:${session.userId}:sms`, 60 * 60, 5)) &&
    (await hitRateLimit(`phone:${phone}:sms`, 60 * 60, 5)) &&
    (!ip || (await hitRateLimit(`ip:${ip}:sms`, 60 * 60, 10)));
  if (!allowed) return { error: "Too many codes requested. Please wait an hour and try again." };

  try {
    if (await phoneTakenByOther(phone, session.userId)) {
      const admin = createAdminClient();
      await admin.from("abuse_flags").insert({
        client_id: session.userId,
        type: "multi_account",
        details: { reason: "phone_already_verified_on_other_account", phone },
      });
      return { error: "This phone number is already linked to another FairGround account." };
    }

    const admin = createAdminClient();
    if (session.profile.phone !== phone || session.profile.phone_verified_at) {
      // Changing the number clears any earlier verification (enforced by a trigger too).
      const { error } = await admin
        .from("profiles")
        .update({ phone, phone_verified_at: null })
        .eq("id", session.userId);
      if (error) {
        console.error("[phone] could not save number:", error.message);
        return { error: "We could not save that number. Please try again." };
      }
    }
  } catch (err) {
    console.error("[phone] admin client unavailable:", err);
    return { error: "Phone verification is not available right now. Please try again later." };
  }

  if (phoneBypassAllowed()) {
    console.warn("[phone] ALLOW_UNVERIFIED_PHONE=true and Twilio is not configured: SMS skipped (dev only).");
    return { ok: true, message: "Development mode: no SMS was sent. Enter any 6 digits to continue.", values: { phone } };
  }

  const result = await startPhoneVerification(phone);
  if (!result.ok) {
    if (result.reason === "not_configured") {
      console.error("[phone] Twilio is not configured and the dev bypass is off.");
      return { error: "Phone verification is not available right now. Please try again later." };
    }
    return { error: "We could not send a code to that number. Check it and try again." };
  }
  return { ok: true, message: "We sent a 6-digit code by text message.", values: { phone } };
}

/** Step 2: check the code and mark the phone verified. */
export async function checkPhoneCode(_prev: FormState, formData: FormData): Promise<FormState> {
  // Phone verification is for clients only.
  const session = await checkRole("client");
  if (!session) return { error: "Only client accounts verify a phone number." };
  const phone = session.profile.phone;
  if (!phone) return { error: "Enter your phone number first." };

  const code = z
    .string()
    .trim()
    .regex(/^\d{4,8}$/)
    .safeParse(String(formData.get("code") ?? ""));
  if (!code.success) {
    return { error: "Enter the code from the text message.", fieldErrors: { code: ["Enter the 6-digit code."] }, values: { phone } };
  }

  if (!(await hitRateLimit(`user:${session.userId}:sms-check`, 60 * 15, 10))) {
    return { error: "Too many attempts. Please wait 15 minutes.", values: { phone } };
  }

  if (!phoneBypassAllowed()) {
    const result = await checkPhoneVerification(phone, code.data);
    if (!result.ok) {
      if (result.reason === "invalid_code") {
        return { error: "That code is not right or has expired.", fieldErrors: { code: ["Check the code and try again."] }, values: { phone } };
      }
      return { error: "Phone verification is not available right now. Please try again later.", values: { phone } };
    }
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ phone_verified_at: new Date().toISOString() })
      .eq("id", session.userId)
      .eq("phone", phone);
    if (error) {
      // 23505: the verified-phone unique index. Another account verified this number first.
      if (error.code === "23505") {
        await admin.from("abuse_flags").insert({
          client_id: session.userId,
          type: "multi_account",
          details: { reason: "phone_already_verified_on_other_account", phone },
        });
        return { error: "This phone number is already linked to another FairGround account." };
      }
      console.error("[phone] verify update failed:", error.message);
      return { error: "We could not save your verification. Please try again." };
    }
  } catch (err) {
    console.error("[phone] admin client unavailable:", err);
    return { error: "Phone verification is not available right now. Please try again later." };
  }

  const next = String(formData.get("next") ?? "");
  redirect(safeNext(next, postLoginPath({ role: session.profile.role, phone_verified_at: "now" })));
}
