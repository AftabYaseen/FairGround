"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkRole } from "@/lib/auth";
import { isAuthnetConfigured } from "@/lib/authnet";
import { cancelProviderSubscription, startSubscription, updateCard } from "@/lib/billing";
import { consentText } from "@/lib/billing-consent";
import type { FormState } from "@/lib/form-state";
import { getOwnProvider } from "@/lib/providers";
import { hitRateLimit } from "@/lib/rate-limit";
import { getRequestMeta } from "@/lib/request-meta";
import { getSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

// Only the Accept.js nonce and billing address arrive here. Card numbers never do.
const cardSchema = z.object({
  dataDescriptor: z.literal("COMMON.ACCEPT.INAPP.PAYMENT"),
  dataValue: z.string().min(10).max(8000),
  firstName: z.string().trim().min(1, "Enter the first name on the card.").max(50),
  lastName: z.string().trim().min(1, "Enter the last name on the card.").max(50),
  address: z.string().trim().min(3, "Enter the billing street address.").max(60),
  city: z.string().trim().max(40).optional().default(""),
  state: z.string().trim().max(40).optional().default(""),
  zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "Enter the billing ZIP code."),
});

async function providerContext() {
  const session = await checkRole("provider");
  if (!session) return null;
  const provider = await getOwnProvider(session.userId);
  if (!provider?.onboarded_at) return null;
  return { session, provider };
}

function parseCard(formData: FormData) {
  return cardSchema.safeParse(Object.fromEntries(formData));
}

export async function startBilling(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await providerContext();
  if (!ctx) return { error: "Please log in as a provider." };
  if (!isAuthnetConfigured()) return { error: "Payments are not available yet. Please try again later." };
  if (formData.get("consent") !== "on") return { error: "Please tick the box to authorise the charges." };
  const card = parseCard(formData);
  if (!card.success) return { error: "Please check your card and billing details.", fieldErrors: z.flattenError(card.error).fieldErrors };
  if (!(await hitRateLimit(`provider:${ctx.provider.id}:billing`, 60 * 10, 5))) {
    return { error: "Too many attempts. Please wait 10 minutes and try again." };
  }

  const settings = await getSettings();
  const { data: paidSetup } = await createAdminClient()
    .from("invoices")
    .select("id")
    .eq("provider_id", ctx.provider.id)
    .eq("kind", "setup_fee")
    .eq("status", "paid")
    .maybeSingle();
  const { ip } = await getRequestMeta();
  const { dataDescriptor, dataValue, ...billTo } = card.data;

  const result = await startSubscription({
    provider: ctx.provider,
    email: ctx.session.email ?? ctx.session.profile.email,
    opaqueData: { dataDescriptor, dataValue },
    billTo,
    consentText: consentText(settings, ctx.provider, !paidSetup),
    ip,
  });
  revalidatePath("/dashboard", "layout");
  return result.ok ? { ok: true, message: "Your subscription is active. Thank you." } : { error: result.message };
}

export async function updateBillingCard(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await providerContext();
  if (!ctx) return { error: "Please log in as a provider." };
  if (!isAuthnetConfigured()) return { error: "Payments are not available yet. Please try again later." };
  const card = parseCard(formData);
  if (!card.success) return { error: "Please check your card and billing details.", fieldErrors: z.flattenError(card.error).fieldErrors };
  if (!(await hitRateLimit(`provider:${ctx.provider.id}:billing`, 60 * 10, 5))) {
    return { error: "Too many attempts. Please wait 10 minutes and try again." };
  }
  const { dataDescriptor, dataValue, ...billTo } = card.data;
  const result = await updateCard({ provider: ctx.provider, opaqueData: { dataDescriptor, dataValue }, billTo });
  revalidatePath("/dashboard", "layout");
  return result.ok ? { ok: true, message: result.message ?? "Your card is updated." } : { error: result.message };
}

export async function cancelBilling(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await providerContext();
  if (!ctx) return { error: "Please log in as a provider." };
  if (formData.get("confirm") !== "CANCEL") return { error: "Type CANCEL to confirm." };
  const result = await cancelProviderSubscription(ctx.provider);
  revalidatePath("/dashboard", "layout");
  return result.ok ? { ok: true, message: result.message } : { error: result.message };
}
