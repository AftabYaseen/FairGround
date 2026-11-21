import "server-only";

import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import type { Tables } from "@/types/database";
import { createClient } from "@/lib/supabase/server";

export type AppSettings = Tables<"app_settings">;

// Fallback used only if the database is unreachable, so marketing pages still render.
export const DEFAULT_SETTINGS: AppSettings = {
  id: true,
  request_expiry_days: 10,
  included_requests: 15,
  beta_open: true,
  beta_signup_deadline: null,
  billing_required: false,
  ga_launch_date: null,
  beta_monthly_cents: 3900,
  beta_setup_cents: 0,
  beta_overage_cents: 800,
  std_monthly_cents: 5900,
  std_setup_cents: 7900,
  std_overage_cents: 1000,
  beta_capacity: 250,
  founding_lock_months: 12,
  fairness_statement_version: 1,
  fairness_statement:
    "FairGround is built to treat service providers fairly. You may submit one active request to one provider at a time. If a provider cannot complete a job, you may submit a new request after closing the current one.",
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

export const getSettings = cache(async (): Promise<AppSettings> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("app_settings").select("*").eq("id", true).maybeSingle();
    if (error || !data) {
      if (error) console.error("[settings] failed to load app_settings:", error.message);
      return DEFAULT_SETTINGS;
    }
    return data;
  } catch (err) {
    unstable_rethrow(err);
    console.error("[settings] failed to load app_settings:", err);
    return DEFAULT_SETTINGS;
  }
});

/** Prices for the plan a provider would sign up on today. */
export function currentPlanPricing(s: AppSettings) {
  return s.beta_open
    ? { plan: "beta" as const, monthly: s.beta_monthly_cents, setup: s.beta_setup_cents, overage: s.beta_overage_cents }
    : { plan: "standard" as const, monthly: s.std_monthly_cents, setup: s.std_setup_cents, overage: s.std_overage_cents };
}

export function overageCentsForPlan(s: AppSettings, plan: "beta" | "standard") {
  return plan === "beta" ? s.beta_overage_cents : s.std_overage_cents;
}
