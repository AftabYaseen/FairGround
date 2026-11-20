"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkRole } from "@/lib/auth";
import type { FormState } from "@/lib/form-state";
import { createClient } from "@/lib/supabase/server";

export async function updateAccountName(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await checkRole(["client", "provider", "admin"]);
  if (!session) return { error: "Please log in again." };

  const parsed = z.string().trim().min(2, "Enter your full name.").max(120).safeParse(formData.get("full_name"));
  if (!parsed.success) return { fieldErrors: { full_name: [parsed.error.issues[0].message] } };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data }).eq("id", session.userId);
  if (error) {
    console.error("[account] name update failed:", error.message);
    return { error: "We could not save your name. Please try again." };
  }
  revalidatePath("/account");
  return { ok: true, message: "Saved." };
}
