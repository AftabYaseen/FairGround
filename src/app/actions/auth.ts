"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { siteUrl } from "@/lib/env";
import { formValues, type FormState } from "@/lib/form-state";
import { toE164 } from "@/lib/format";
import { emailField } from "@/lib/validation";
import { postLoginPath } from "@/lib/post-login";
import { hitRateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request-meta";
import { safeNext } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SIGNUP_IP_LIMIT = { windowSeconds: 60 * 60, max: 5 };
const SIGNUP_DEVICE_LIMIT = { windowSeconds: 60 * 60 * 24, max: 3 };

const signUpSchema = z.object({
  role: z.enum(["provider", "client"], { message: "Choose how you will use FairGround." }),
  full_name: z.string().trim().min(2, "Enter your full name.").max(120),
  email: emailField,
  phone: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const e164 = toE164(v);
      if (!e164) {
        ctx.addIssue({ code: "custom", message: "Enter a valid phone number, for example (555) 123-4567." });
        return z.NEVER;
      }
      return e164;
    }),
  password: z.string().min(8, "Use at least 8 characters.").max(72, "Use 72 characters or fewer."),
  terms: z.literal("on", { message: "You need to accept the terms and fairness policy." }),
  device_fingerprint: z.string().trim().max(128).optional().default(""),
});

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["password"]);
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const input = parsed.data;
  const { ip } = await getRequestMeta();

  // Anti-circumvention: limit sign-ups by IP and by device.
  if (ip && !(await hitRateLimit(`ip:${ip}:signup`, SIGNUP_IP_LIMIT.windowSeconds, SIGNUP_IP_LIMIT.max))) {
    return { error: "Too many sign-ups from this network. Please try again in an hour.", values };
  }
  if (
    input.device_fingerprint &&
    !(await hitRateLimit(`device:${input.device_fingerprint}:signup`, SIGNUP_DEVICE_LIMIT.windowSeconds, SIGNUP_DEVICE_LIMIT.max))
  ) {
    return { error: "Too many accounts have been created from this device today.", values };
  }

  // One account per phone number.
  try {
    const admin = createAdminClient();
    const { data: taken } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", input.phone)
      .not("phone_verified_at", "is", null)
      .limit(1);
    if (taken && taken.length > 0) {
      return {
        error: "This phone number is already linked to a FairGround account. Log in instead, or use a different number.",
        fieldErrors: { phone: ["Already linked to an account."] },
        values,
      };
    }
  } catch (err) {
    console.error("[signup] phone uniqueness check skipped:", err);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/callback`,
      data: {
        role: input.role,
        full_name: input.full_name,
        phone: input.phone,
        device_fingerprint: input.device_fingerprint || null,
      },
    },
  });

  if (error) {
    console.error("[signup] auth error:", error.status, error.message);
    if (error.status === 429) return { error: "Too many attempts. Please wait a few minutes and try again.", values };
    if (/password/i.test(error.message)) {
      return { error: error.message, fieldErrors: { password: [error.message] }, values };
    }
    return { error: "We could not create your account. Please check your details and try again.", values };
  }

  // Email confirmation turned off in Supabase: we already have a session.
  if (data.session) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, phone_verified_at")
      .eq("id", data.session.user.id)
      .maybeSingle();
    redirect(postLoginPath(profile));
  }

  // Same response whether or not the email already exists (no account enumeration).
  redirect(`/signup/check-email?email=${encodeURIComponent(input.email)}`);
}

const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["password"]);
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const { email, password, next } = parsed.data;

  const { ip } = await getRequestMeta();
  if (ip && !(await hitRateLimit(`ip:${ip}:login`, 15 * 60, 20))) {
    return { error: "Too many login attempts. Please wait 15 minutes and try again.", values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") {
      return {
        error: "Please confirm your email first. Check your inbox for the link we sent you.",
        values: { ...values, unconfirmed: "1" },
      };
    }
    return { error: "That email and password do not match an account.", values };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, phone_verified_at")
    .eq("id", data.user.id)
    .maybeSingle();

  const home = postLoginPath(profile);
  // Unverified phones always go to verification first.
  redirect(home === "/verify-phone" ? `/verify-phone${next ? `?next=${encodeURIComponent(next)}` : ""}` : safeNext(next, home));
}

export async function resendConfirmation(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = emailField.safeParse(String(formData.get("email") ?? ""));
  if (!email.success) return { error: "Enter a valid email address." };
  const { ip } = await getRequestMeta();
  if (ip && !(await hitRateLimit(`ip:${ip}:resend`, 60 * 60, 5))) {
    return { error: "Too many requests. Please try again later." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.data,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) console.error("[resend] error:", error.message);
  return { ok: true, message: "If that account is waiting for confirmation, we have sent a new link." };
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = emailField.safeParse(String(formData.get("email") ?? ""));
  if (!email.success) return { error: "Enter a valid email address.", values: formValues(formData) };
  const { ip } = await getRequestMeta();
  if (ip && !(await hitRateLimit(`ip:${ip}:reset`, 60 * 60, 5))) {
    return { error: "Too many requests. Please try again later." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
  });
  if (error) console.error("[reset] error:", error.message);
  return { ok: true, message: "If an account exists for that email, we have sent a link to reset your password." };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const schema = z
    .object({
      password: z.string().min(8, "Use at least 8 characters.").max(72),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, { message: "The passwords do not match.", path: ["confirm"] });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: "Your reset link has expired. Please request a new one." };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    console.error("[update-password] error:", error.message);
    return { error: error.message };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, phone_verified_at")
    .eq("id", userData.user.id)
    .maybeSingle();
  redirect(postLoginPath(profile));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
