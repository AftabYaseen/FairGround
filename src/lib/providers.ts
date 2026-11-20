import "server-only";

import { cache } from "react";
import type { Tables } from "@/types/database";
import { createClient } from "@/lib/supabase/server";

/** Columns anyone may read (matches the anon column grant in 001_core_schema). */
export const PUBLIC_PROVIDER_COLUMNS =
  "id, business_name, slug, tagline, description, logo_url, phone_public, website, city, state, service_zips, years_in_business, typical_jobs, is_listed, onboarded_at, requests_paused, avg_response_hours, created_at";

export type PublicProvider = Pick<
  Tables<"providers">,
  | "id"
  | "business_name"
  | "slug"
  | "tagline"
  | "description"
  | "logo_url"
  | "phone_public"
  | "website"
  | "city"
  | "state"
  | "service_zips"
  | "years_in_business"
  | "typical_jobs"
  | "is_listed"
  | "onboarded_at"
  | "requests_paused"
  | "avg_response_hours"
  | "created_at"
>;

export type Category = Pick<Tables<"service_categories">, "id" | "name" | "slug" | "sort_order">;

export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_categories")
    .select("id, name, slug, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (error) console.error("[providers] categories failed:", error.message);
  return data ?? [];
});

export async function getProviderCategoryIds(providerId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("provider_categories").select("category_id").eq("provider_id", providerId);
  return (data ?? []).map((r) => r.category_id);
}

export const getPublicProviderBySlug = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("providers")
    .select(`${PUBLIC_PROVIDER_COLUMNS}, provider_categories(category_id)`)
    .eq("slug", slug)
    .maybeSingle();
  if (error) console.error("[providers] by slug failed:", error.message);
  if (!data) return null;
  const { provider_categories, ...provider } = data;
  return { provider: provider as PublicProvider, categoryIds: provider_categories.map((c) => c.category_id) };
});

/** The signed-in provider's own row (all columns). */
export const getOwnProvider = cache(async (profileId: string): Promise<Tables<"providers"> | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("providers").select("*").eq("profile_id", profileId).maybeSingle();
  if (error) console.error("[providers] own provider failed:", error.message);
  return data ?? null;
});

export const DIRECTORY_PAGE_SIZE = 12;

export async function listDirectory({ categoryId, zip, page }: { categoryId?: string; zip?: string; page: number }) {
  const supabase = await createClient();
  const from = (page - 1) * DIRECTORY_PAGE_SIZE;
  const embed = categoryId ? "provider_categories!inner(category_id)" : "provider_categories(category_id)";
  let query = supabase
    .from("providers")
    .select(`${PUBLIC_PROVIDER_COLUMNS}, ${embed}`, { count: "exact" })
    .eq("is_listed", true)
    .not("onboarded_at", "is", null)
    .order("requests_paused", { ascending: true })
    .order("business_name", { ascending: true })
    .range(from, from + DIRECTORY_PAGE_SIZE - 1);
  if (categoryId) query = query.eq("provider_categories.category_id", categoryId);
  if (zip) query = query.contains("service_zips", [zip]);

  const { data, error, count } = await query;
  if (error) {
    console.error("[providers] directory failed:", error.message);
    return { providers: [], total: 0, error: true as const };
  }
  return {
    providers: (data ?? []).map(({ provider_categories, ...p }) => ({
      provider: p as PublicProvider,
      categoryIds: provider_categories.map((c) => c.category_id),
    })),
    total: count ?? 0,
    error: false as const,
  };
}
