"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkRole } from "@/lib/auth";
import { formValues, type FormState } from "@/lib/form-state";
import { LINK_LOCK_COOKIE } from "@/lib/link-lock";
import { notifyRequestClosed, notifyRequestCreated } from "@/lib/notifications";
import { SUBMIT_MESSAGES, TIMING_OPTIONS, type SubmitResult } from "@/lib/request-codes";
import { getRequestMeta } from "@/lib/request-meta";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import { optionalText, zipField } from "@/lib/validation";

export async function acceptFairness(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await checkRole("client");
  if (!session) return { error: "Please log in with a client account." };
  if (formData.get("agree") !== "on") return { error: "Please tick the box to agree before continuing." };

  const settings = await getSettings();
  const { ip, userAgent } = await getRequestMeta();
  const supabase = await createClient();
  const { error } = await supabase.from("fairness_acknowledgements").insert({
    client_id: session.userId,
    statement_version: settings.fairness_statement_version,
    ip,
    user_agent: userAgent,
  });
  if (error) {
    console.error("[ack] insert failed:", error.message);
    return { error: "We could not save your agreement. Please try again." };
  }
  revalidatePath("/request/new");
  return { ok: true };
}

const requestSchema = z.object({
  provider: z.string().trim().regex(/^[a-z0-9-]{1,80}$/),
  category_id: z.uuid("Choose the type of service."),
  title: z.string().trim().min(3, "Give your request a short title.").max(120, "Use 120 characters or fewer."),
  description: z
    .string()
    .trim()
    .min(20, "Describe the job in at least 20 characters so the provider can help.")
    .max(4000, "Use 4,000 characters or fewer."),
  zip: zipField,
  city: optionalText(80),
  preferred_timing: z.enum(TIMING_OPTIONS, { message: "Choose when you need the work done." }),
  contact_name: z.string().trim().min(2, "Enter your name.").max(120),
  device_fingerprint: z.string().trim().max(128).optional().default(""),
});

export async function submitRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await checkRole("client");
  if (!session) return { error: "Please log in with a client account." };
  const values = formValues(formData);

  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }
  const input = parsed.data;

  // Entry path is decided on the server: the link-lock cookie means they came through this provider's own link.
  const cookieStore = await cookies();
  const lockedSlug = cookieStore.get(LINK_LOCK_COOKIE)?.value;
  if (lockedSlug && lockedSlug !== input.provider) {
    return { error: "You came to FairGround through another provider's link. Your request stays with that provider.", values };
  }
  const entryPath = lockedSlug === input.provider ? "link" : "browse";

  const { ip, userAgent } = await getRequestMeta();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_request", {
    p_provider_slug: input.provider,
    p_category_id: input.category_id,
    p_title: input.title,
    p_description: input.description,
    p_zip: input.zip,
    p_city: input.city ?? "",
    p_preferred_timing: input.preferred_timing,
    p_contact_name: input.contact_name,
    p_entry_path: entryPath,
    p_device_fingerprint: input.device_fingerprint || undefined,
    p_ip: ip ?? undefined,
    p_user_agent: userAgent ?? undefined,
  });

  if (error) {
    console.error("[request] submit_request rpc failed:", error.message);
    return { error: "We could not send your request. Please try again.", values };
  }
  const result = data as SubmitResult;
  if (!result.ok || !result.request_id) {
    const msg = SUBMIT_MESSAGES[result.code] ?? SUBMIT_MESSAGES.INVALID_INPUT;
    let body = msg.body;
    if (result.code === "DUPLICATE_JOB") {
      body +=
        result.account_status === "locked"
          ? " This is your second violation, so new requests are locked for 7 days."
          : result.account_status === "suspended"
            ? " Your account has been suspended."
            : " This is a warning. A second violation locks new requests for 7 days.";
    }
    return { errorTitle: msg.title, error: body, values: { ...values, code: result.code } };
  }

  // Emails never block or fail the request.
  await notifyRequestCreated(result.request_id, Boolean(result.provider_cap_reached));

  revalidatePath("/my-request");
  redirect("/my-request?sent=1");
}

const closeSchema = z.object({
  request_id: z.uuid(),
  outcome: z.enum(["hired", "not_hired", "no_response", ""]).optional(),
});

export async function closeMyRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await checkRole("client");
  if (!session) return { error: "Please log in again." };
  const parsed = closeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Something went wrong. Please refresh and try again." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_request", {
    p_request_id: parsed.data.request_id,
    p_new_status: "closed_by_client",
    p_outcome: parsed.data.outcome || undefined,
  });
  const result = data as { ok: boolean; code: string } | null;
  if (error || !result?.ok) {
    console.error("[request] close failed:", error?.message ?? result?.code);
    return { error: result?.code === "NOT_ACTIVE" ? "This request is already closed." : "We could not close your request. Please try again." };
  }

  await notifyRequestClosed(parsed.data.request_id);
  // The request is resolved, so the provider link lock ends too.
  (await cookies()).delete(LINK_LOCK_COOKIE);
  revalidatePath("/my-request");
  return { ok: true, message: "Your request is closed. You can send a new request when you are ready." };
}

export async function reportOutcome(formData: FormData) {
  const session = await checkRole("client");
  if (!session) return;
  const parsed = z
    .object({ request_id: z.uuid(), outcome: z.enum(["hired", "not_hired", "no_response"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("client_report_outcome", {
    p_request_id: parsed.data.request_id,
    p_outcome: parsed.data.outcome,
  });
  if (error) console.error("[request] outcome report failed:", error.message);
  revalidatePath("/my-request");
}

/**
 * Ends a provider link lock. Only allowed once the client has sent a request to that
 * provider and it has been resolved (the lock lasts "until the request is resolved").
 */
export async function clearLinkLock() {
  const session = await checkRole("client");
  const cookieStore = await cookies();
  const lockedSlug = cookieStore.get(LINK_LOCK_COOKIE)?.value;
  if (!session || !lockedSlug) redirect("/providers");

  const supabase = await createClient();
  const { data: provider } = await supabase.from("providers").select("id").eq("slug", lockedSlug).maybeSingle();
  const { data: requests } = await supabase
    .from("requests")
    .select("status, provider_id")
    .eq("client_id", session.userId);
  const hasActive = (requests ?? []).some((r) => r.status === "active");
  const resolvedWithLocked = (requests ?? []).some((r) => r.status !== "active" && r.provider_id === provider?.id);

  if (hasActive) redirect("/my-request");
  if (provider && !resolvedWithLocked) redirect(`/p/${lockedSlug}`);
  cookieStore.delete(LINK_LOCK_COOKIE);
  redirect("/providers");
}
