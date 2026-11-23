import type { Tables } from "@/types/database";
import { homeForRole } from "@/lib/roles";

/** Where a user should land after signing in or confirming their email. */
export function postLoginPath(profile: Pick<Tables<"profiles">, "role" | "phone_verified_at"> | null): string {
  if (!profile) return "/login";
  // Phone verification is for clients only. Providers and admins never go to /verify-phone.
  if (profile.role === "client" && !profile.phone_verified_at) return "/verify-phone";
  return homeForRole(profile.role);
}
