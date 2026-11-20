import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SUPABASE_URL } from "@/lib/env";

/**
 * Privileged Supabase client using SUPABASE_SECRET_KEY. Bypasses RLS.
 * SERVER ONLY. Use it only after checking the caller's role on the server.
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !secret) {
    throw new Error("Supabase admin client is not configured (SUPABASE_SECRET_KEY missing).");
  }
  return createClient<Database>(SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
