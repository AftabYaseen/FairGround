import "server-only";

import { redirect, unstable_rethrow } from "next/navigation";
import { cache } from "react";
import type { Tables } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { homeForRole, type Role } from "@/lib/roles";

export type Profile = Tables<"profiles">;
export type { Role };

export type SessionInfo = {
  userId: string;
  email: string | null;
  emailConfirmed: boolean;
  profile: Profile | null;
};

/** Current user and profile, verified against Supabase Auth. Cached per request. */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
    return {
      userId: data.user.id,
      email: data.user.email ?? null,
      emailConfirmed: Boolean(data.user.email_confirmed_at),
      profile: profile ?? null,
    };
  } catch (err) {
    unstable_rethrow(err);
    console.error("[auth] getSession failed:", err);
    return null;
  }
});

/**
 * Server-side role guard for pages and Server Actions. Redirects when the caller
 * is signed out or has the wrong role.
 */
export async function requireRole(roles: Role | Role[], nextPath?: string): Promise<SessionInfo & { profile: Profile }> {
  const allowed = Array.isArray(roles) ? roles : [roles];
  const session = await getSession();
  if (!session || !session.profile) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  if (!allowed.includes(session.profile.role)) {
    redirect(homeForRole(session.profile.role));
  }
  return session as SessionInfo & { profile: Profile };
}

/** Same check for Server Actions that should return an error instead of redirecting. */
export async function checkRole(roles: Role | Role[]): Promise<(SessionInfo & { profile: Profile }) | null> {
  const allowed = Array.isArray(roles) ? roles : [roles];
  const session = await getSession();
  if (!session?.profile || !allowed.includes(session.profile.role)) return null;
  return session as SessionInfo & { profile: Profile };
}

export { homeForRole };
