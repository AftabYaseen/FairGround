"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { notifyRequestClosed } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

type RpcResult = { ok: boolean; code: string } | null;

async function adminClient() {
  const session = await checkRole("admin");
  if (!session) throw new Error("Admin only");
  return createClient();
}

function logIfFailed(label: string, error: { message: string } | null, data: unknown) {
  const r = data as RpcResult;
  if (error || !r?.ok) console.error(`[admin] ${label} failed:`, error?.message ?? r?.code);
}

export async function adminSetRequestInvalid(formData: FormData) {
  const parsed = z
    .object({ request_id: z.uuid(), invalid: z.enum(["true", "false"]), reason: z.string().trim().max(500).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc("admin_set_request_invalid", {
    p_request_id: parsed.data.request_id,
    p_invalid: parsed.data.invalid === "true",
    p_reason: parsed.data.reason || undefined,
  });
  logIfFailed("set invalid", error, data);
  revalidatePath(`/admin/requests/${parsed.data.request_id}`);
  revalidatePath("/admin/requests");
}

export async function adminCloseRequest(formData: FormData) {
  const parsed = z
    .object({ request_id: z.uuid(), note: z.string().trim().max(1000).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc("close_request", {
    p_request_id: parsed.data.request_id,
    p_new_status: "closed_by_admin",
    p_note: parsed.data.note || undefined,
  });
  logIfFailed("close", error, data);
  if ((data as RpcResult)?.ok) await notifyRequestClosed(parsed.data.request_id);
  revalidatePath(`/admin/requests/${parsed.data.request_id}`);
  revalidatePath("/admin/requests");
}

export async function adminSetClientStatus(formData: FormData) {
  const parsed = z
    .object({
      client_id: z.uuid(),
      status: z.enum(["active", "warned", "locked", "suspended"]),
      reset: z.enum(["true", "false"]).optional(),
      note: z.string().trim().max(500).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc("admin_set_client_status", {
    p_client_id: parsed.data.client_id,
    p_status: parsed.data.status,
    p_reset_violations: parsed.data.reset === "true",
    p_note: parsed.data.note || undefined,
  });
  logIfFailed("client status", error, data);
  revalidatePath("/admin/clients");
  revalidatePath("/admin/flags");
}

export async function adminResolveFlag(formData: FormData) {
  const parsed = z
    .object({ flag_id: z.uuid(), status: z.enum(["open", "resolved", "dismissed"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc("admin_resolve_flag", { p_flag_id: parsed.data.flag_id, p_status: parsed.data.status });
  logIfFailed("resolve flag", error, data);
  revalidatePath("/admin/flags");
  revalidatePath("/admin");
}

export async function adminUpdateProvider(formData: FormData) {
  const parsed = z
    .object({
      provider_id: z.uuid(),
      is_listed: z.enum(["true", "false"]).optional(),
      admin_pause: z.enum(["true", "false"]).optional(),
      plan: z.enum(["beta", "standard"]).optional(),
      monthly_cap: z.coerce.number().int().min(0).max(1000).optional(),
    })
    .safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return;
  const p = parsed.data;
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc("admin_update_provider", {
    p_provider_id: p.provider_id,
    p_is_listed: p.is_listed === undefined ? undefined : p.is_listed === "true",
    p_admin_pause: p.admin_pause === undefined ? undefined : p.admin_pause === "true",
    p_plan: p.plan,
    p_monthly_cap: p.monthly_cap,
  });
  logIfFailed("update provider", error, data);
  revalidatePath("/admin/providers");
  revalidatePath("/providers");
}

const dollars = z.coerce.number().min(0, "Must be 0 or more.").max(100000).transform((v) => Math.round(v * 100));
const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date.")
  .transform((v) => (v === "" ? null : v));

const settingsSchema = z.object({
  request_expiry_days: z.coerce.number().int().min(1).max(90),
  included_requests: z.coerce.number().int().min(0).max(1000),
  beta_open: z.enum(["on", "off"]).default("off").transform((v) => v === "on"),
  beta_signup_deadline: optionalDate,
  ga_launch_date: optionalDate,
  beta_monthly: dollars,
  beta_setup: dollars,
  beta_overage: dollars,
  std_monthly: dollars,
  std_setup: dollars,
  std_overage: dollars,
  beta_capacity: z.coerce.number().int().min(0).max(100000),
  founding_lock_months: z.coerce.number().int().min(0).max(120),
  fairness_statement: z.string().trim().min(20).max(1000),
  bump_version: z.enum(["on", "off"]).default("off"),
});

export async function adminUpdateSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await checkRole("admin");
  if (!session) return { error: "Admin only." };
  const parsed = settingsSchema.safeParse({ beta_open: "off", bump_version: "off", ...Object.fromEntries(formData) });
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const s = parsed.data;
  const supabase = await createClient();
  const { data: current } = await supabase.from("app_settings").select("fairness_statement_version").eq("id", true).single();
  const { error } = await supabase
    .from("app_settings")
    .update({
      request_expiry_days: s.request_expiry_days,
      included_requests: s.included_requests,
      beta_open: s.beta_open,
      beta_signup_deadline: s.beta_signup_deadline,
      ga_launch_date: s.ga_launch_date,
      beta_monthly_cents: s.beta_monthly,
      beta_setup_cents: s.beta_setup,
      beta_overage_cents: s.beta_overage,
      std_monthly_cents: s.std_monthly,
      std_setup_cents: s.std_setup,
      std_overage_cents: s.std_overage,
      beta_capacity: s.beta_capacity,
      founding_lock_months: s.founding_lock_months,
      fairness_statement: s.fairness_statement,
      fairness_statement_version: (current?.fairness_statement_version ?? 1) + (s.bump_version === "on" ? 1 : 0),
    })
    .eq("id", true);
  if (error) {
    console.error("[admin] settings update failed:", error.message);
    return { error: "We could not save the settings." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}
