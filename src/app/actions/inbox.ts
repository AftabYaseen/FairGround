"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { notifyRequestClosed } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

type RpcResult = { ok: boolean; code: string } | null;

export async function markRequestViewed(requestId: string) {
  const session = await checkRole("provider");
  if (!session || !z.uuid().safeParse(requestId).success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("provider_mark_request", { p_request_id: requestId, p_action: "viewed" });
  if (error) console.error("[inbox] mark viewed failed:", error.message);
}

export async function markRequestResponded(formData: FormData) {
  const session = await checkRole("provider");
  const id = z.uuid().safeParse(formData.get("request_id"));
  if (!session || !id.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("provider_mark_request", { p_request_id: id.data, p_action: "responded" });
  if (error) console.error("[inbox] mark responded failed:", error.message);
  revalidatePath(`/dashboard/requests/${id.data}`);
  revalidatePath("/dashboard");
}

const closeSchema = z
  .object({
    request_id: z.uuid(),
    status: z.enum(["declined", "completed", "closed_by_provider"]),
    outcome: z.enum(["hired", "not_hired", "no_response", ""]).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.status === "declined" || Boolean(v.outcome), {
    message: "Choose an outcome.",
    path: ["outcome"],
  });

export async function providerCloseRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await checkRole("provider");
  if (!session) return { error: "Please log in as a provider." };
  const parsed = closeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Please choose an outcome.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const { request_id, status, outcome, note } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_request", {
    p_request_id: request_id,
    p_new_status: status,
    p_outcome: outcome || undefined,
    p_note: note || undefined,
  });
  const result = data as RpcResult;
  if (error || !result?.ok) {
    console.error("[inbox] close failed:", error?.message ?? result?.code);
    const msg =
      result?.code === "NOT_ACTIVE"
        ? "This request is already closed."
        : result?.code === "OUTCOME_REQUIRED"
          ? "Choose an outcome."
          : "We could not update this request. Please try again.";
    return { error: msg };
  }

  await notifyRequestClosed(request_id);
  revalidatePath(`/dashboard/requests/${request_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/requests");
  return { ok: true, message: status === "declined" ? "Request declined. The client has been told." : "Request closed." };
}

function triggerMessage(message: string | undefined): string {
  if (message?.startsWith("CAP_REACHED")) {
    return "You have used all included requests this month. Turn on extra requests below, or wait until the 1st.";
  }
  if (message?.startsWith("PAUSE_LOCKED")) {
    return "This pause was set by FairGround. Please contact us to lift it.";
  }
  return "We could not save that change. Please try again.";
}

export async function setRequestsPaused(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await checkRole("provider");
  if (!session) return { error: "Please log in as a provider." };
  const paused = formData.get("paused") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("providers").update({ requests_paused: paused }).eq("profile_id", session.userId);
  if (error) {
    console.error("[settings] pause failed:", error.message);
    return { error: triggerMessage(error.message) };
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: paused ? "New requests are paused." : "You are accepting requests again." };
}

export async function setOverageOptIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await checkRole("provider");
  if (!session) return { error: "Please log in as a provider." };
  const optIn = formData.get("opt_in") === "true";
  if (optIn && formData.get("confirm") !== "on") {
    return { error: "Please tick the box to confirm you agree to the price per extra request." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("providers").update({ overage_opt_in: optIn }).eq("profile_id", session.userId);
  if (error) {
    console.error("[settings] overage failed:", error.message);
    return { error: triggerMessage(error.message) };
  }
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    message: optIn
      ? "Extra requests are on. You will keep receiving requests after your included ones."
      : "Extra requests are off. We will pause new requests when you reach your included amount.",
  };
}
