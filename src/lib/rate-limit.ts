import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Counts one hit against `key` in a fixed window. Returns false when over the limit.
 * Fails open (returns true) if the database or secret key is unavailable, and logs it,
 * so a misconfiguration never locks everyone out.
 */
export async function hitRateLimit(key: string, windowSeconds: number, max: number): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("hit_rate_limit", {
      p_key: key.slice(0, 300),
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    if (error) {
      console.error("[rate-limit] rpc failed:", error.message);
      return true;
    }
    return data !== false;
  } catch (err) {
    console.error("[rate-limit] unavailable:", err);
    return true;
  }
}
